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
from config import OPENAI_KEY

log = logging.getLogger(__name__)

class KBProtocolLoader:
    """Load static protocol documents into KB system"""
    
    def __init__(self, protocols_dir: str = None):
        if protocols_dir is None:
            # Get absolute path to protocols directory
            base_dir = os.path.dirname(os.path.abspath(__file__))
            protocols_dir = os.path.join(base_dir, "kb_protocols")
            self.protocols_dir = protocols_dir
            self.client = OpenAI(api_key=OPENAI_KEY) if OPENAI_KEY else None
        
    def parse_protocol_file(self, file_path: str) -> Optional[Dict]:
        """Parse a protocol text file into structured data"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            # Extract metadata using regex (fixed patterns to handle spaces in headers)
            title_match = re.search(r'^TITLE:\s*(.+)$', content, re.MULTILINE)
            category_match = re.search(r'^CATEGORY:\s*(.+)$', content, re.MULTILINE)
            department_match = re.search(r'^DEPARTMENT:\s*(.+)$', content, re.MULTILINE)
            problem_match = re.search(r'^PROBLEM:\s*(.+?)(?=^[A-Z][A-Z_ ]*:|$)', content, re.MULTILINE | re.DOTALL)
            
            # Extract solution steps
            solution_match = re.search(r'^SOLUTION STEPS:\s*(.+?)(?=^[A-Z][A-Z_ ]*:|$)', content, re.MULTILINE | re.DOTALL)
            
            if not title_match:
                log.warning(f"No title found in {file_path}")
                log.debug(f"First 200 chars of content: {content[:200]}")
                return None
            
            # Debug logging for parsing results
            log.debug(f"Parsed {file_path}:")
            log.debug(f"  Title: {title_match.group(1) if title_match else 'None'}")
            log.debug(f"  Category: {category_match.group(1) if category_match else 'None'}")
            log.debug(f"  Problem found: {bool(problem_match)}")
            log.debug(f"  Solution found: {bool(solution_match)}")
            if problem_match:
                log.debug(f"  Problem content: {problem_match.group(1)[:100]}...")
            if solution_match:
                log.debug(f"  Solution content: {solution_match.group(1)[:100]}...")
                
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
            
            # Check if article already exists (but don't skip, just log)
            try:
                existing = KBArticle.query.filter_by(canonical_fingerprint=fingerprint).first()
                if existing:
                    log.info(f"KB article already exists, updating: {protocol_data['title']}")
                    # Will update after creating markdown_content below
                    pass
            except Exception as e:
                log.warning(f"Could not check for existing article: {e}")
                existing = None  # Continue with creation
            
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
            
            # If article already exists, update it and return
            if existing:
                log.info(f"Updating existing KB article: {protocol_data['title']}")
                existing.content_md = markdown_content
                existing.problem_summary = protocol_data['problem_summary'][:500]
                existing.updated_at = datetime.utcnow()
                return existing
            
            # Create KB article with safe enum handling
            try:
                source_value = KBArticleSource.protocol
            except (AttributeError, ValueError):
                # Fallback if 'protocol' enum doesn't exist yet - use 'human' for protocol docs
                source_value = KBArticleSource.human
                log.info("Using 'human' source for protocol document (protocol enum not available)")
                
            article = KBArticle(
                title=protocol_data['title'],
                problem_summary=protocol_data['problem_summary'][:500],  # Truncate for summary
                content_md=markdown_content,
                category_id=dept_id,
                source=source_value,
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
            log.warning(f"Protocols directory not found: {self.protocols_dir}")
            try:
                os.makedirs(self.protocols_dir, exist_ok=True)
                log.info(f"Created protocols directory: {self.protocols_dir}")
            except Exception as e:
                log.error(f"Could not create protocols directory: {e}")
                return results
        
        try:
            files = os.listdir(self.protocols_dir)
        except Exception as e:
            log.error(f"Could not list files in {self.protocols_dir}: {e}")
            return results
        
        protocol_files = [f for f in files if f.endswith('.txt')]
        
        if not protocol_files:
            log.info(f"No .txt protocol files found in {self.protocols_dir}")
            return results
        
        for filename in protocol_files:
            file_path = os.path.join(self.protocols_dir, filename)
            log.info(f"Processing protocol file: {filename}")
            
            try:
                # Parse the file
                protocol_data = self.parse_protocol_file(file_path)
                if not protocol_data:
                    results["errors"] += 1
                    continue
                
                # Create KB article
                log.info(f"Attempting to create KB article for: {protocol_data['title']}")
                article = self.create_kb_article(protocol_data)
                if article:
                    results["loaded"] += 1
                    log.info(f"✅ Successfully loaded protocol: {protocol_data['title']}")
                else:
                    results["skipped"] += 1
                    log.warning(f"⚠️ Skipped protocol (create_kb_article returned None): {protocol_data['title']}")
                    
            except Exception as e:
                log.error(f"Error processing {filename}: {e}")
                results["errors"] += 1
        
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
            
            # Safe ordering with fallback
            try:
                articles = search_query.order_by(
                    # Try to prioritize protocol articles if enum exists
                    KBArticle.source == 'protocol',
                    KBArticle.created_at.desc()
                ).limit(limit).all()
            except Exception as e:
                log.warning(f"Could not order by protocol source: {e}")
                # Fallback to simple ordering
                articles = search_query.order_by(
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
