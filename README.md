# Flowmora Browser 


![Uploading Gemini_Generated_Image_c9kz7jc9kz7jc9kz-removebg-preview.png…]()

A modern, secure Chromium-based desktop browser built with Electron. Features intelligent Knowledge Mode for automatic content classification and a rule-based page summarizer.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/electron-33.2.0-47848F.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)

## ✨ Features

### 🧠 Knowledge Mode
- **Auto-Classification**: Automatically categorizes pages by Subject, Topic, and Chapter
- **Content Extraction**: Captures headings, paragraphs, and key points from visited pages
- **IndexedDB Storage**: All knowledge stored locally for privacy
- **Export to PDF**: Generate a beautifully formatted Knowledge Book

### ✨ Smart Summarizer
- **100% Offline**: No AI or external APIs required
- **Rule-Based Scoring**: Extracts top 5 key sentences using keyword frequency and heading proximity
- **Definitions Extraction**: Finds sentences containing definitions
- **Examples Detection**: Identifies real-world examples mentioned on pages

### 🎨 Premium UI
- **Chrome-Grade Design**: Clean, minimal, professional interface
- **Dark/Light Themes**: Elegant Dracula-inspired dark mode and clean light mode
- **Tabbed Browsing**: Full multi-tab support with smooth animations
- **Keyboard Shortcuts**: Power user friendly

### 🔒 Security
- **Isolated Sessions**: Each window has its own session
- **Incognito Mode**: Private browsing with no history
- **Content Security Policy**: Protected against XSS attacks

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/piyushrajyadav/flowmora-browser.git

# Navigate to project directory
cd flowmora-browser

# Install dependencies
npm install

# Start the browser
npm start
```

## 📁 Project Structure

```
flowmora-browser/
├── main.js           # Electron main process
├── preload.js        # Preload script for IPC
├── renderer.js       # Browser UI and features
├── index.html        # Main browser window
├── styles.css        # Premium CSS styling
├── package.json      # Project configuration
├── Flowmora.png      # App icon
└── README.md         # This file
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New Tab |
| `Ctrl+W` | Close Tab |
| `Ctrl+R` / `F5` | Reload |
| `Ctrl+L` | Focus URL Bar |
| `Alt+←` | Go Back |
| `Alt+→` | Go Forward |
| `Escape` | Stop Loading |

## 🛠️ Development

```bash
# Run in development mode
npm run dev

# Build for production (coming soon)
npm run build
```

## 📖 Usage Guide

### Using Knowledge Mode
1. Click the **🧠** button to enable
2. Browse any educational content
3. Pages are automatically classified and stored
4. Use Menu → **📘 Export Knowledge PDF**

### Using the Summarizer
1. Enable Knowledge Mode first
2. Navigate to a content-rich page
3. Use Menu → **✨ Summarize Page**
4. View the modal with:
   - 📋 5 Key Summary Points
   - 📖 3 Definitions
   - 🌍 2 Real-World Examples

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Piyush Yadav**
- GitHub: [@piyushrajyadav](https://github.com/piyushrajyadav)

## 🙏 Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Inspired by modern browsers like Chrome and Edge
- Icons from inline SVGs

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/piyushrajyadav">Piyush Yadav</a>
</p>
# Flowmora-Browser
