FROM node:24

# System packages PlantUML needs: Java to run it, Graphviz for diagram
# layout, and fonts so text can be measured when sizing boxes.
# How it works: 
# -------------
# RUN executes a command at build time and saves the result as an image layer.
# apt-get update refreshes the package list, and install installs from it.
# -y auto-answers yes, since a build can’t prompt you. --no-install-recommends skips optional extras to keep the image small.
# default-jre-headless is Java without graphics libraries, which is all PlantUML needs.
# rm -rf /var/lib/apt/lists/* deletes the downloaded package lists. It must be in the same RUN, because a file deleted in a later layer still takes up space in the earlier one.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      default-jre-headless graphviz fontconfig fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Change npm install to npm ci --omit=dev so
# it builds use exactly the versions in the lock file and skip dev dependencies.
RUN npm ci --omit=dev

# PlantUML is a Java program, so the server needs its jar. Download it at build time instead of committing it to git.
# How it works: 
# -------------
# curl downloads the file, and -o server/plantuml.jar saves it relative to WORKDIR /app.
# without -f, a wrong URL would save an HTML error page as plantuml.jar and the build would still look fine.
# releases/latest/download/plantuml.jar is a GitHub permalink that always points to the newest stable release, without needing a version number.
# It sits before COPY . . so code edits don’t trigger a re-download. COPY . . won’t overwrite the jar, because the .dockerignore excludes server/plantuml.jar.
RUN curl -fL --create-dirs -o server/plantuml.jar \
    https://github.com/plantuml/plantuml/releases/latest/download/plantuml.jar

COPY . .

EXPOSE 3000

CMD ["node", "server/index.js"]