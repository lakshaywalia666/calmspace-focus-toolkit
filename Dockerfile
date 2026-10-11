FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY tools /usr/share/nginx/html/tools
COPY disable-right-click.js /usr/share/nginx/html/disable-right-click.js
EXPOSE 80
