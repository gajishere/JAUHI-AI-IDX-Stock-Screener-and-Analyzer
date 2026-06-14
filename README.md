# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## AI-Enhanced Analysis (Optional)

This application includes optional AI-enhanced analysis using Claude AI. To enable this feature:

1. Get an API key from [Anthropic](https://console.anthropic.com/)
2. Create a `.env` file in the project root with:
   ```
   VITE_CLAUDE_API_KEY=your_api_key_here
   ```
3. Restart the development server

The AI analysis will appear in the stock report section when available, providing:
- Enhanced summary insights
- Additional considerations and risks
- Confidence levels with reasoning
- Specific actionable tips for traders

Note: Without the API key, the application will function normally using rule-based analysis only.
