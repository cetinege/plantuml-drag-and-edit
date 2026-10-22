FROM node:24

# System packages PlantUML needs: Java to run it, Graphviz for diagram
# layout, and fonts so text can be measured when sizing boxes.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      default-jre-headless graphviz fontconfig fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Change npm install to npm ci --omit=dev so
# it builds use exactly the versions in the lock file and skip dev dependencies.
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "server/index.js"]