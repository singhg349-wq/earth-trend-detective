# Dockerfile for Earth System Trend Detective Backend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/

# Create data/artifacts directory for runtime
RUN mkdir -p data/artifacts data/fixtures

# Copy Streamlit app for fallback
COPY streamlit_app.py .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=7860

# Expose the port
EXPOSE 7860

# Run the backend
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "$PORT"]