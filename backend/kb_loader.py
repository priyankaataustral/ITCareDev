# backend/kb_loader.py
import os
import re
import hashlib
import logging
from datetime import datetime
from typing import List, Dict, Optional
from openai import OpenAI
from models import KBArticle, KBArticleSource, KBArticleStatus, KBArticleVisibility, Department
from extensions import db
from config import OPENAI_API_KEY

log = logging.getLogger(__name__)

class KBProtocolLoader:
    """Load static protocol documents into KB system"""
    
    def __init__(self, protocols_dir: str = "backend/kb_protocols"):
        self.protocols_dir = protocols_dir
        self.client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
        
    def parse_protocol_file(self, file_path: str) -> Optional[Dict]:
        """Parse a protocol text file into structured data"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            # Extract metadata using regex
            title_match = re.search(r'^TITLE:\s*(.+)$', content, re.MULTILINE)
            category_match = re.search(r'^CATEGORY:\s*(.+)$', content, re.MULTILINE)
            department_match = re.search(r'^DEPARTMENT:\s*(.+)$', content, re.MULTILINE)
            problem_match = re.search(r'^PROBLEM:\s*(.+?)(?=^[A-Z_]+:|$)', content, re.MULTILINE | re.DOTALL)
            
            # Extract solution steps
            solution_match = re.search(r'^SOLUTION STEPS:\s*(.+?)(?=^[A-Z_]+:|$)', content, re.MULTILINE | re.DOTALL)
            
            if not title_match:
                log.warning(f"No title found in {file_path}")
                return None
                
            # Create structured data
            protocol_data = {
                'title': title_match.group(1).strip(),
                'category': category_match.group(1).strip() if category_match else 'General',
                'department_name': department_match.group(1).strip() if department_match else 'General Support',
                'problem_summary': problem_match.group(1).strip() if problem_match else '',
                'solution_content': solution_match.group(1).strip() if solution_match else '',
                'full_content': content,
                'file_path': file_path
            }
            
            return protocol_data
            
        except Exception as e:
            log.error(f"Error parsing protocol file {file_path}: {e}")
            return None
    
    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate OpenAI embedding for semantic search"""
        if not self.client:
            log.warning("OpenAI client not available for embeddings")
            return None
            
        try:
            response = self.client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            log.error(f"Error generating embedding: {e}")
            return None
    
    def get_or_create_department(self, dept_name: str) -> int:
        """Get or create department by name"""
        dept = Department.query.filter_by(name=dept_name).first()
        if not dept:
            dept = Department(name=dept_name)
            db.session.add(dept)
            db.session.flush()  # Get ID without committing
        return dept.id
    
    def create_kb_article(self, protocol_data: Dict) -> Optional[KBArticle]:
        """Create KB article from protocol data"""
        try:
            # Get department ID
            dept_id = self.get_or_create_department(protocol_data['department_name'])
            
            # Create content fingerprint for deduplication
            content_text = f"{protocol_data['title']}\n{protocol_data['problem_summary']}\n{protocol_data['solution_content']}"
            fingerprint = hashlib.sha256(content_text.encode('utf-8')).hexdigest()
            
            # Check if article already exists
            existing = KBArticle.query.filter_by(canonical_fingerprint=fingerprint).first()
            if existing:
                log.info(f"KB article already exists: {protocol_data['title']}")
                return existing
            
            # Generate embedding for semantic search
            embedding_text = f"{protocol_data['title']} {protocol_data['problem_summary']} {protocol_data['solution_content']}"
            embedding = self.generate_embedding(embedding_text)
            
            # Create markdown content
            markdown_content = f"""# {protocol_data['title']}

**Category:** {protocol_data['category']}  
**Department:** {protocol_data['department_name']}

## Problem
{protocol_data['problem_summary']}

## Solution
{protocol_data['solution_content']}

---
*Source: Company Protocol Document*
"""
            
            # Create KB article
            article = KBArticle(
                title=protocol_data['title'],
                problem_summary=protocol_data['problem_summary'][:500],  # Truncate for summary
                content_md=markdown_content,
                category_id=dept_id,
                source=KBArticleSource.protocol,
                visibility=KBArticleVisibility.internal,
                status=KBArticleStatus.published,
                canonical_fingerprint=fingerprint,
                embedding_model="text-embedding-3-small" if embedding else None,
                embedding_hash=hashlib.md5(str(embedding).encode()).hexdigest() if embedding else None,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                approved_by="system"
            )
            
            db.session.add(article)
            db.session.flush()
            
            # Store embedding if available (you might want to add an embeddings table)
            if embedding:
                log.info(f"Generated embedding for: {protocol_data['title']}")
            
            return article
            
        except Exception as e:
            log.error(f"Error creating KB article: {e}")
            db.session.rollback()
            return None
    
    def load_all_protocols(self) -> Dict[str, int]:
        """Load all protocol files from the protocols directory"""
        results = {"loaded": 0, "skipped": 0, "errors": 0}
        
        if not os.path.exists(self.protocols_dir):
            log.error(f"Protocols directory not found: {self.protocols_dir}")
            return results
        
        for filename in os.listdir(self.protocols_dir):
            if filename.endswith('.txt'):
                file_path = os.path.join(self.protocols_dir, filename)
                log.info(f"Processing protocol file: {filename}")
                
                # Parse the file
                protocol_data = self.parse_protocol_file(file_path)
                if not protocol_data:
                    results["errors"] += 1
                    continue
                
                # Create KB article
                article = self.create_kb_article(protocol_data)
                if article:
                    results["loaded"] += 1
                    log.info(f"Loaded protocol: {protocol_data['title']}")
                else:
                    results["skipped"] += 1
        
        try:
            db.session.commit()
            log.info(f"KB Protocol loading complete: {results}")
        except Exception as e:
            db.session.rollback()
            log.error(f"Error committing KB articles: {e}")
            results["errors"] = results["loaded"]
            results["loaded"] = 0
        
        return results
    
    def search_relevant_articles(self, query: str, department_id: Optional[int] = None, limit: int = 5) -> List[KBArticle]:
        """Search for relevant KB articles (both protocol and dynamic)"""
        try:
            # Start with basic text search
            search_query = KBArticle.query.filter(
                KBArticle.status == KBArticleStatus.published
            )
            
            # Filter by department if specified
            if department_id:
                search_query = search_query.filter(KBArticle.category_id == department_id)
            
            # Text-based search in title and content
            search_terms = query.lower().split()
            for term in search_terms:
                search_query = search_query.filter(
                    db.or_(
                        KBArticle.title.ilike(f'%{term}%'),
                        KBArticle.problem_summary.ilike(f'%{term}%'),
                        KBArticle.content_md.ilike(f'%{term}%')
                    )
                )
            
            articles = search_query.order_by(
                # Prioritize protocol articles, then by creation date
                KBArticle.source == KBArticleSource.protocol.value,
                KBArticle.created_at.desc()
            ).limit(limit).all()
            
            return articles
            
        except Exception as e:
            log.error(f"Error searching KB articles: {e}")
            return []


def get_kb_loader() -> KBProtocolLoader:
    """Get KB loader instance"""
    return KBProtocolLoader()


# CLI command for loading protocols
if __name__ == "__main__":
    import sys
    loader = KBProtocolLoader()
    
    if len(sys.argv) > 1 and sys.argv[1] == "load":
        print("Loading protocol documents...")
        results = loader.load_all_protocols()
        print(f"Results: {results}")
    else:
        print("Usage: python kb_loader.py load")
