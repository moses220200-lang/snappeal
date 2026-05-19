FROM squidfunk/mkdocs-material:latest

WORKDIR /docs

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

EXPOSE 8000
