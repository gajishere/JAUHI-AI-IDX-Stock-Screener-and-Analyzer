📈 AI IDX Stock Analyst

An advanced, AI-driven web application designed to act as a Senior Equity Analyst and Professional Day Trader for the Indonesian Stock Exchange (IDX / BEI). Powered by Next.js and the Anthropic Claude Vision API, this tool automates complex stock screening, interprets market momentum, and decodes broker activity from user-uploaded screenshots.
✨ Key Features

    Vision-Powered Broker Intelligence: Upload screenshots of Broker Summaries or Mid-Day Foreign Flow. The AI utilizes OCR and LLM reasoning to extract data, profile broker behavior (Smart Money vs. Retail), and analyze net flows.
    Pack Hunting Detection: Advanced analytical logic to detect coordinated retail movements, identifying market traps like "The Wolf Pack" (gang sell vs. solo buy) or "The Decoy Hunt" (gang buy vs. solo sell).
    Dual Analysis Workflows:
        Closing Analysis: End-of-day evaluation combining market data and broker summaries to generate highly confident trading plans for the next session.
        Mid-Day Analysis: Fast-paced momentum screening based on Session 1 foreign activity to capture Session 2 intraday opportunities.
    Strict Market Filters: Built-in auto-exclusion for low-velocity/stagnant stocks, and strict parameters for heavy blue-chip or banking sectors unless exceptional momentum is detected.
    Dynamic Rating System: Provides objective scoring (A+ to C-) across multiple timeframes (Short, Mid, Long-term) based on Foreign Flow, Broker, Technical, Fundamental, and Trend signals.

🛠️ Tech Stack

    Frontend: Next.js, React, TailwindCSS, TypeScript, JavaScript
    AI / Backend: Anthropic Claude API (Vision-enabled for screenshot extraction)
    UI/UX: Modern, responsive financial dashboard interface with drag-and-drop file upload capabilities.

⚠️ Disclaimer

Not Financial Advice. This application is built for educational and analytical purposes only. Stock market trading involves significant risk. The AI's analysis, including "Pack Hunting" detection, is based on probabilistic reasoning of provided data and does not guarantee future market performance. Always conduct your own research (DYOR) before making any investment decisions.
