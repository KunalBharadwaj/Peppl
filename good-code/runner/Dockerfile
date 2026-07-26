# Use the official Node.js 14 as a parent image
FROM node:20

# Set the working directory in the container
WORKDIR /code

# Copy package.json and package-lock.json (if available) to the working directory
COPY package*.json ./

# Install any dependencies
RUN npm install

# Copy the rest of your application's code to the working directory
COPY . .

# Build your app
RUN npm run build

# runner/ws binds to port 3001 by default (see src/index.ts)
EXPOSE 3001

# Define the command to run your app using CMD which defines your runtime
CMD [ "node", "dist/index.js" ]

