FROM storefront_image
COPY ops/demo/storefront-runtime/init.sh /init-next-server.sh
USER 0:0
ENTRYPOINT ["/bin/sh", "/init-next-server.sh"]
