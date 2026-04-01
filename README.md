# 🍎 Mind Your Health - AI Health Assistant

**Mind Your Health** is a professional-grade, AI-powered nutritional companion designed to help you make smarter food choices in seconds. Using Google's Gemini AI, it analyzes food images, voice descriptions, and text inputs to provide deep nutritional insights, macro tracking, and personalized health plans.

![App Preview]<img width="1920" height="1200" alt="image" src="https://github.com/user-attachments/assets/9042c4ca-4c76-4c1c-9362-1a12e2e988d5" />


## 🚀 Key Features

- **📸 Smart Image Analysis**: Snap a photo of your meal or a nutrition label. The AI identifies the food and breaks down its health impact.
- **🎙️ Voice-First Logging**: Don't want to type? Just say what you ate (e.g., "I had two eggs and a bowl of oats for breakfast") in multiple languages.
- **📊 Bento-Style Insights**: Get a clean, visual breakdown of "The Good," "The Bad," and "The Verdict" for every food item.
- **📈 Daily Macro Tracker**: Log your meals throughout the day and watch your Protein, Carbs, and Fats progress bars update in real-time.
- **⚖️ Personalized Health Plans**: Enter your age, weight, and activity level to get a custom estimation of your daily nutritional requirements.
- **🍳 5-Min Healthy Recipes**: Instantly generate healthy alternatives or recipes based on the food you're analyzing.
- **🌍 Multi-Language Support**: Use the app in English, Hindi, Marathi, Tamil, or Bengali.
- **🔐 Secure Sync**: Powered by Firebase, your data is securely synced across devices with Google Login.

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, TypeScript
- **Styling**: Tailwind CSS (Mobile-first, responsive design)
- **Animations**: Framer Motion
- **AI Engine**: Google Gemini AI (@google/genai)
- **Backend/Auth**: Firebase (Firestore & Authentication)
- **Charts**: Recharts (Interactive Donut & Progress Charts)
- **Icons**: Lucide React

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/mind-your-health.git
   cd mind-your-health
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Variables**:
   Create a `.env` file in the root directory and add your API keys:
   ```env
   GEMINI_API_KEY=your_google_gemini_api_key
   # Firebase configuration is typically loaded from firebase-applet-config.json
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

## 🛡️ Security & Validation

- **Input Validation**: The AI strictly identifies "Non-Food" items to prevent nonsensical analysis.
- **Firestore Security Rules**: Robust rules ensure that users can only read and write their own data.
- **Error Handling**: Custom notification system for graceful error reporting and permission management.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Built with ❤️ for a healthier world.*
