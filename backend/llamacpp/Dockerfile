FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake curl wget \
    && rm -rf /var/lib/apt/lists/*

# Install llama-cpp-python with its built-in OpenAI-compatible server
RUN pip install --no-cache-dir "llama-cpp-python[server]==0.3.4"

RUN mkdir -p /models

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
