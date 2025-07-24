# 📊 MarketPulse - Daily Market Price Tracker API

**MarketPulse** is a powerful RESTful API backend built with **Node.js**, **Express.js**, and **MongoDB**, designed to serve a real-time daily market price tracking web application. It enables users to view and compare prices of fresh products across multiple markets in the USA, while admins and vendors manage and update data securely.

---

## 🌐 Live Site
👉 [Visit MarketPulse Live](https://marketpulse-7f4bf.web.app/)

> This API serves as the backbone of the MarketPulse frontend application. It handles user-submitted prices, admin approvals, market and product management, and serves dynamic content based on date, market, and category filters.

---

## ⚙️ Technologies Used
- Node.js
- Express.js
- MongoDB Atlas
- Mongoose
- dotenv
- JWT (JSON Web Tokens)
- CORS
- bcryptjs

---

## 🚀 Key Features
- 🔐 User authentication with JWT
- 📝 Submit new product prices
- ✅ Admin approval system for submitted prices
- 🏬 Market and category management
- 📅 Filter prices by date, market, or category
- 📈 Fetch price history for comparison
- 📚 Pagination support
- 🛡️ Role-based access control for admin operations

---

## 📂 API Endpoints

### ✅ Get All Approved Products
```http
GET /approved-products
```

### 🔍 Filter by Date
```http
GET /approved-products?date=YYYY-MM-DD
```

### 📈 Get Price History by Product Name
```http
GET /price-history/:productName
```

### 🧾 Submit New Product Price (Pending)
```http
POST /products
```

### 📝 Get All Submitted (Pending) Products (Admin)
```http
GET /products/pending
```

### 🚫 Delete Product (Admin)
```http
DELETE /products/:id
```

---

## 🏷️ Markets and Categories

### 📋 Get All Markets
```http
GET /markets
```

### ➕ Add New Market
```http
POST /markets
```

### 📋 Get All Categories
```http
GET /categories
```

### ➕ Add New Category
```http
POST /categories
```

---

## 🔐 Authentication

### 🔓 Register a New User
```http
POST /auth/register
```

### 🔑 Login and Receive Token
```http
POST /auth/login
```

---

## 👨‍💼 Admin Features
- Approve or delete submitted product entries
- Add/edit market locations and categories
- Role-based access protection
- View data analytics (via frontend charts)

---

## 📦 Deployment & Hosting
- Backend hosted on **Render**
- Database hosted on **MongoDB Atlas**
- Frontend deployed on **Firebase Hosting**

---

**© 2025 MarketPulse | All Rights Reserved**

---

### Made with ❤️ by Hasanuzzaman Joy
