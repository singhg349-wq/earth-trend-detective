# Container for the Streamlit fallback and the local JSON API.
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "streamlit>=1.36" "plotly>=5.20"

# Copy application code
COPY backend/ ./backend/
COPY streamlit_app.py .

# Copy the small regional result files used by the fallback. The large grid
# tiles are not needed by streamlit_app.py and are deliberately left out.
COPY data/artifacts/*.json ./data/artifacts/
COPY data/artifacts/regions.geojson ./data/artifacts/
RUN mkdir -p data/fixtures

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=7860
ENV APP_MODE=streamlit

# Expose the port
EXPOSE 7860

# Run the Streamlit fallback by default. Set APP_MODE=backend to serve the API.
CMD ["sh", "-c", "if [ \"$APP_MODE\" = \"backend\" ]; then exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860}; else exec streamlit run streamlit_app.py --server.address 0.0.0.0 --server.port ${PORT:-7860} --server.headless true; fi"]
