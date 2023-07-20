FROM public.ecr.aws/docker/library/node:18.16.1-alpine3.18
WORKDIR /usr
COPY . /usr
RUN rm -rf node_modules
RUN npm install
RUN npm run build
CMD [ "node", "dist/index.js" ]
