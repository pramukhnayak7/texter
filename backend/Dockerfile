FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PORT=8000
ENV WORKERS=1
ENV OMP_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1
ENV MKL_NUM_THREADS=1

EXPOSE 8000

CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers ${WORKERS}'
