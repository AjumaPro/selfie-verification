# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Same-origin auth when frontend + API share one DigitalOcean app domain
ARG REACT_APP_AUTH_API_URL=
ARG REACT_APP_API_BASE_URL=https://selfie.imsgh.org:2035/skyface
ARG REACT_APP_DEFAULT_USER_ID=
ARG REACT_APP_DEFAULT_MERCHANT_KEY=
ARG REACT_APP_DEFAULT_CENTER=BRANCHLESS
ENV REACT_APP_AUTH_API_URL=$REACT_APP_AUTH_API_URL \
    REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL \
    REACT_APP_DEFAULT_USER_ID=$REACT_APP_DEFAULT_USER_ID \
    REACT_APP_DEFAULT_MERCHANT_KEY=$REACT_APP_DEFAULT_MERCHANT_KEY \
    REACT_APP_DEFAULT_CENTER=$REACT_APP_DEFAULT_CENTER
RUN node download-models.js && npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
