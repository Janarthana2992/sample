#!/bin/sh
set -e

MODEL_URL="${MODEL_URL:-https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf}"
MODEL_PATH="/models/model.gguf"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Downloading model from $MODEL_URL ..."
    wget -q --show-progress -O "$MODEL_PATH" "$MODEL_URL"
    echo "Model downloaded."
else
    echo "Model already present, skipping download."
fi

exec python -m llama_cpp.server \
    --model "$MODEL_PATH" \
    --host 0.0.0.0 \
    --port 8080 \
    --n_ctx 4096 \
    --n_threads 4
