# Front reverse proxy: nginx serving the landing page and proxying the two apps.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY landing/ /usr/share/nginx/html/
