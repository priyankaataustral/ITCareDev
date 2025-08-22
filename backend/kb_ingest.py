import os
import csv
import json
import faiss
import numpy as np
from openai import OpenAI
from dotenv import load_dotenv

OPENAI_API_KEY=os.environ["OPENAI_API_KEY"]
client = OpenAI(api_key=OPENAI_API_KEY)
# ─── Configuration ──────────────────────────────────────────────────────────────
load_dotenv()  
API_KEY   = os.getenv("OPENAI_API_KEY")
EMB_MODEL = "text-embedding-ada-002"
INPUT_CSV = os.path.join(os.path.dirname(__file__), "data", "cleaned_tickets.csv")
INDEX_FILE= os.path.join(os.path.dirname(__file__), "faiss_index.bin")
META_FILE = os.path.join(os.path.dirname(__file__), "faiss_meta.json")

if not API_KEY:
    raise RuntimeError("Missing OPENAI_API_KEY in environment")

# ─── Initialize OpenAI & FAISS ──────────────────────────────────────────────────
client = OpenAI(api_key=API_KEY)
dim    = 1536  # dimensionality of text-embedding-ada-002
index  = faiss.IndexFlatL2(dim)
metadatas = []

# ─── Ingest & Embed ─────────────────────────────────────────────────────────────
print("Reading CSV and chunking answers…")
with open(INPUT_CSV, newline="", encoding="utf8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        ticket_id = row["id"]
        answer    = row.get("answer", "").strip()
        if not answer:
            continue

        # Split into ~1000-char chunks (approx 500-800 tokens)
        for i in range(0, len(answer), 1000):
            chunk = answer[i : i + 1000]

            # Embed the chunk
            resp = client.embeddings.create(model=EMB_MODEL, input=chunk)
            emb  = np.array(resp.data[0].embedding, dtype="float32")

            # Add to FAISS index
            index.add(emb.reshape(1, -1))

            # Record metadata for retrieval
            metadatas.append({
                "ticket_id": ticket_id,
                "chunk": chunk
            })

print(f"Embedded and indexed {len(metadatas)} chunks.")

# ─── Persist Index & Metadata ──────────────────────────────────────────────────
print(f"Saving FAISS index to {INDEX_FILE} …")
faiss.write_index(index, INDEX_FILE)

print(f"Saving metadata to {META_FILE} …")
with open(META_FILE, "w", encoding="utf8") as f:
    json.dump(metadatas, f, ensure_ascii=False, indent=2)

print("Ingestion complete! You can now load faiss_index.bin and faiss_meta.json in your app.")





