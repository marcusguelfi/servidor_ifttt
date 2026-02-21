FROM python:3.11-slim
RUN pip install --no-cache-dir fauxmo==0.8.0
RUN mkdir -p /etc/fauxmo
COPY config.json /etc/fauxmo/config.json
CMD ["python", "-u", "-m", "fauxmo.cli", "-v", "-c", "/etc/fauxmo/config.json"]
