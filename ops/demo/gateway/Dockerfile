FROM nginx:stable-trixie@sha256:09cc2702709e6388d979d8030e3ab4eb1ceb699b2dced26d7543e872a822e823
COPY nginx.conf /etc/nginx/nginx.conf
USER 101:101
ENTRYPOINT ["nginx", "-g", "daemon off;"]
