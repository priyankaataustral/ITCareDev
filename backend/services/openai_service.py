# backend/services/openai_service.py

import os
import numpy as np
import openai
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Configure API key
openai.api_key = os.getenv('OPENAI_API_KEY')

# Model constants
CHAT_MODEL = "gpt-3.5-turbo"
EMBEDDING_MODEL = "text-embedding-ada-002"

def generate_draft(prompt: str, max_tokens: int = 200) -> str:
    """
    Generate a draft response using OpenAI's ChatCompletion API.

    Args:
        prompt (str): The user prompt to send to the chat model.
        max_tokens (int): Maximum tokens to generate.

    Returns:
        str: The assistant's reply.
    """
    response = openai.ChatCompletion.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": "You are a helpful IT support assistant."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=max_tokens,
        temperature=0.5,
        n=1,
    )
    return response.choices[0].message.content.strip()

def embed_text(text: str) -> np.ndarray:
    """
    Embed text into a vector using OpenAI's Embedding API.

    Args:
        text (str): Text to embed.

    Returns:
        np.ndarray: Embedding vector (float32).
    """
    resp = openai.Embedding.create(
        model=EMBEDDING_MODEL,
        input=text
    )
    # Extract the embedding array
    embedding = resp.data[0].embedding
    return np.array(embedding, dtype="float32")

# Example usage
if __name__ == "__main__":
    sample = "How do I troubleshoot a VPN connection issue?"
    print("Draft:", generate_draft(sample))
    vec = embed_text("VPN troubleshooting steps")
    print("Embedding shape:", vec.shape)
