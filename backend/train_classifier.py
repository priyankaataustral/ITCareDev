# train_classifier.py
import pandas as pd
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

# 1) Load your CSV
df = pd.read_csv("data/cleaned_tickets.csv", dtype=str)
df = df.dropna(subset=["text", "category_id"])

# 2) Split train/test
X_train, X_test, y_train, y_test = train_test_split(
    df["text"], df["category_id"], test_size=0.2, random_state=42, stratify=df["category_id"]
)

# 3) Fit TF-IDF + classifier
vect = TfidfVectorizer(max_features=5000, ngram_range=(1,2))
Xtr = vect.fit_transform(X_train)
clf = LogisticRegression(max_iter=1000)
clf.fit(Xtr, y_train)

# 4) Evaluate
Xte = vect.transform(X_test)
print(classification_report(y_test, clf.predict(Xte)))

# 5) Persist
with open("classifier.pkl", "wb") as f:
    pickle.dump({"vectorizer": vect, "model": clf}, f)
print("Saved classifier to classifier.pkl")
