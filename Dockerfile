# Use a slim version of Python for a smaller image
FROM python:3.12-slim

# Set the working directory inside the container
WORKDIR /backend

# Copy the backend code into the working directory
COPY ./backend /backend

# Install Python dependencies from requirements.txt
RUN pip install --no-cache-dir -r /backend/requirements.txt

# Expose the port your Flask app runs on
EXPOSE 8000

# Run gunicorn to serve the Flask application
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "run:app"]