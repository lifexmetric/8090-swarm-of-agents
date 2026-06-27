FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Bake model at build time — Docker caches this layer unless requirements.txt changes
RUN python3 -c "\
import os, shutil; \
from huggingface_hub import hf_hub_download; \
os.makedirs('/app/models/onnx', exist_ok=True); \
os.makedirs('/app/models/tokenizer', exist_ok=True); \
onnx = hf_hub_download('jinaai/jina-embeddings-v2-base-code', 'onnx/model_quantized.onnx'); \
shutil.copy(onnx, '/app/models/onnx/model_quantized.onnx'); \
tok  = hf_hub_download('jinaai/jina-embeddings-v2-base-code', 'tokenizer.json'); \
shutil.copy(tok, '/app/models/tokenizer/tokenizer.json'); \
shutil.rmtree(os.path.expanduser('~/.cache/huggingface'), ignore_errors=True); \
print('Model baked in.')"
COPY . .
EXPOSE 8010
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010", "--timeout-keep-alive", "120"]
