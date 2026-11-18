FROM nginx:alpine
COPY index.html manifest.webmanifest sw.js /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY tools /usr/share/nginx/html/tools
EXPOSE 80
