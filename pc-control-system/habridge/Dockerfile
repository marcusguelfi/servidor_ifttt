FROM eclipse-temurin:17-jre-alpine
WORKDIR /opt/habridge
RUN apk add --no-cache curl && \
    curl -L -o ha-bridge.jar https://github.com/bwssytems/ha-bridge/releases/download/v5.4.1/ha-bridge-5.4.1.jar
EXPOSE 8080 80
VOLUME /opt/habridge/data
CMD ["java", "-jar", "ha-bridge.jar", "-Dconfig.file=/opt/habridge/data/habridge.config"]
