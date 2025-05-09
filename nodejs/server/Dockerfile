FROM node:18

WORKDIR /app

# Copy package files first (ensures cache efficiency)
COPY package.json package-lock.json ./

# Force install dependencies inside the container
RUN npm install

# Copy the rest of the server files
COPY . .

CMD ["npm", "start"]

