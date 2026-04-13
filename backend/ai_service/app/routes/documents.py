import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings
from app.services.rag_service import rag_kb

router = APIRouter(prefix="/admin/documents", tags=["admin-documents"])
bearer_scheme = HTTPBearer()
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf", ".csv", ".docx"}


def _require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    if payload.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    return payload


def _extract_extension(filename: str) -> str:
    return ("." + filename.rsplit(".", 1)[-1]).lower() if "." in filename else ""


async def _read_file_content(file: UploadFile) -> str:
    """Read and extract text content from uploaded file."""
    ext = _extract_extension(file.filename or "")
    raw = await file.read()

    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"File too large. Max {MAX_FILE_SIZE // (1024*1024)} MB")

    if ext == ".pdf":
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(pages).strip()

    if ext == ".docx":
        import io
        from docx import Document as DocxDocument
        doc = DocxDocument(io.BytesIO(raw))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs).strip()

    # txt, md, csv — decode as UTF-8
    try:
        return raw.decode("utf-8").strip()
    except UnicodeDecodeError:
        return raw.decode("latin-1").strip()


@router.get("")
async def list_documents(_: dict = Depends(_require_admin)):
    """List all admin-uploaded RAG documents."""
    docs = rag_kb.list_custom_docs()
    return {"documents": docs, "total": len(docs)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    _: dict = Depends(_require_admin),
):
    """Upload a document to feed into the RAG knowledge base."""
    filename = file.filename or "unnamed"
    ext = _extract_extension(filename)

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await _read_file_content(file)
    if not content or len(content.strip()) < 20:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty or too short")

    doc_id = str(uuid.uuid4())
    chunk_count = await rag_kb.add_custom_document(doc_id, filename, content)

    return {
        "doc_id": doc_id,
        "filename": filename,
        "chunk_count": chunk_count,
        "char_count": len(content),
    }


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, _: dict = Depends(_require_admin)):
    """Remove a document and its chunks from the RAG knowledge base."""
    deleted = await rag_kb.delete_custom_document(doc_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return {"status": "deleted", "doc_id": doc_id}
