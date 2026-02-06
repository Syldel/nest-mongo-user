<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.mongodb.com/" target="blank"><img src="https://i.imgur.com/1KpKJEJ.png" width="120" alt="MongoDB Logo" /></a>
</p>

# 🛡️ NestJS Mongo User Microservice

<p align="center">
  <img src="https://i.imgur.com/qfrGoJ5.png" width="120" alt="User Logo" />
</p>

A lightweight, secure NestJS microservice for user management and authentication using MongoDB and JWT. Designed for crypto-related applications, it uses Wallet Addresses as primary identifiers.

## 🚀 Features

- Authentication: Secure login/register using Wallet Address and Password.
- Security: Password hashing with bcrypt and route protection via custom AuthGuard.
- Database: MongoDB integration using Mongoose.Validation: Strict DTO validation with class-validator.
- Flexibility: Dedicated field for tradingSettings to store bot strategies.
- Clean Code: Zero-tolerance ESLint configuration and strict TypeScript typing.

## 🛠️ Installation

### Clone and install dependencies:
```bash
npm install
```

Environment Setup:

Create a .env file in the root directory:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/nest-mongo-user
JWT_USER_SECRET=your_generated_hex_secret
JWT_SERVICE_SECRET=super-secret-service
JWT_EXPIRES_IN=1h
```

Generate a secure JWT Secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

🚦 API Endpoints

```bash
curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
       "password": "secure_password_123"
     }'
```

Note: This returns an access_token. Use it in the following steps.

```bash
curl -X GET http://localhost:3000/auth/me \
     -H "Authorization: Bearer VOTRE_TOKEN_JWT" \
     -H "Content-Type: application/json"
```

Update Trading Settings

```bash
curl -X PATCH http://localhost:3000/auth/settings \
     -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     -H "Content-Type: application/json" \
     -d '{
       "botId": "alpha-1",
       "strategy": "EMA-Cross",
       "leverage": 5
     }'
```

## 🛡️ Security Best Practices
Type Safety: Custom AuthGuard and Request interfaces ensure no any types are used in sensitive authentication logic.

Validation: Wallet addresses are validated via Regex (/^0x[a-fA-F0-9]{40}$/).

📦 Production Build

```bash
npm run build

# run in production mode
npm run start:prod
```