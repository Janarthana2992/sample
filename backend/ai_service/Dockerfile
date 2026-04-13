FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev cmake && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
# Install CPU-only PyTorch first to avoid pulling CUDA packages (saves ~3GB)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /app/faiss_store
EXPOSE 8005
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
