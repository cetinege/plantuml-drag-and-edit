FROM node:24

WORKDIR /app

COPY package*.json ./

# changde npm install to npm ci --omit=dev so
# it builds use exactly the versions in the lock file and skip dev dependencies.
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]