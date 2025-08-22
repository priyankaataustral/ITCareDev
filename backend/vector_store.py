# backend/vector_store.py

import faiss
import pickle
import numpy as np
from services.openai_service import embed_text

# Paths for storing the FAISS index and the mapping from index IDs to document IDs
INDEX_PATH = 'faiss.index'
MAPPING_PATH = 'index_mapping.pkl'

class VectorStore:
    def __init__(self):
        """
        On initialization, try to load an existing FAISS index and ID mapping.
        If not present, initialize an empty L2 index.
        """
        try:
            # Attempt to load existing index
            self.index = faiss.read_index(INDEX_PATH)
            with open(MAPPING_PATH, 'rb') as f:
                self.id_mapping = pickle.load(f)
        except Exception:
            # Create a new empty index (dimension 768 for text-embedding-ada-002)
            self.index = faiss.IndexFlatL2(768)
            self.id_mapping = {}

    def build_index(self, documents):
        """
        Build (or rebuild) the FAISS index from scratch.
        
        Args:
          documents (List[Tuple[int, str]]): 
            A list of tuples, each containing (doc_id, text_to_index).
        """
        vectors = []
        ids = []
        for doc_id, text in documents:
            vec = embed_text(text)
            vectors.append(vec)
            ids.append(doc_id)

        # Stack into a single matrix and add to FAISS
        mat = np.vstack(vectors).astype('float32')
        self.index = faiss.IndexFlatL2(mat.shape[1])
        self.index.add(mat)

        # Store mapping from FAISS internal IDs to your document IDs
        self.id_mapping = {i: ids[i] for i in range(len(ids))}

        # Persist to disk
        faiss.write_index(self.index, INDEX_PATH)
        with open(MAPPING_PATH, 'wb') as f:
            pickle.dump(self.id_mapping, f)

    def query(self, text, top_k=5):
        """
        Given a query string, embed it, search the FAISS index, and return
        the top_k most similar document IDs.
        
        Args:
          text (str): The query text.
          top_k (int): Number of nearest neighbors to retrieve.
        
        Returns:
          List[int]: The list of document IDs most similar to the query.
        """
        # Convert query text to embedding
        vec = embed_text(text).astype('float32')
        # Search
        distances, indices = self.index.search(np.expand_dims(vec, 0), top_k)
        # Map back to original doc IDs
        return [ self.id_mapping[idx] for idx in indices[0] if idx in self.id_mapping ]
