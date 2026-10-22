FROM node:24-bookworm-slim

# System packages PlantUML needs: Java to run it, Graphviz for diagram
# layout, and fonts so text can be measured when sizing boxes.
# How it works: 
# -------------
# RUN executes a command at build time and saves the result as an image layer.
# apt-get update refreshes the package list, and install installs from it.
# -y auto-answers yes, since a build can’t prompt you. --no-install-recommends skips optional extras to keep the image small.
# default-jre-headless is Java without graphics libraries, which is all PlantUML needs.
# The slim image has no curl, and the Dockerfile uses it to download the PlantUML jar, so install it.
# ca-certificates is the set of trusted certificates that HTTPS needs. Without it, curl fails with a certificate error.
# rm -rf /var/lib/apt/lists/* deletes the downloaded package lists. It must be in the same RUN, because a file deleted in a later layer still takes up space in the earlier one.
 RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      default-jre-headless graphviz fontconfig fonts-dejavu-core curl ca-certificates \
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

# Without a locale, Java defaults to ASCII and mangles non-ASCII characters
# (accents, « » stereotypes) in diagrams. 
# It includes Unicode character set too now.
ENV LC_ALL=C.UTF-8

# Run as the unprivileged "node" user that the Node image already provides, instead of root.
# How it works: 
# -------------
# By default, everything in a container runs as root.
# USER node makes every instruction after it, and the running container, use the node user instead. 
# If someone finds a way to run commands through the server, they get the privileges of whatever user it runs as. 
# As root inside the container, they could change system files and install software. 
# As node, they can do much less. Small and easy protection.
USER node

EXPOSE 3000

CMD ["node", "server/index.js"]