# Contributing to Papstation Browser 贡献指南

Thank you for your interest in contributing to Papstation Browser! 🎉

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great together.

## How Can I Contribute?

### 🐛 Report Bugs

1. Check if the bug already exists in [Issues](https://github.com/ruanmingze/papstation-browser/issues)
2. If not, create a new issue with:
   - Clear title
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - System info (OS, Papstation version)

### 💡 Suggest Features

Open an issue with the `enhancement` label describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives considered

### 🔧 Submit Code

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/papstation-browser.git
cd papstation-browser

# Install dependencies
pnpm install

# Run in development mode (with DevTools)
pnpm run dev

# Run in production mode
pnpm start
```

## Pull Request Process

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes** following our style guidelines

3. **Test** your changes thoroughly

4. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add new feature description"
   ```

5. **Push** and create a Pull Request

6. **Wait for review** - we'll get back to you soon!

## Style Guidelines

### JavaScript

- Use ES6+ features
- Use `const` and `let`, avoid `var`
- Use meaningful variable names
- Add comments for complex logic

### CSS

- Use CSS variables for theming
- Follow BEM naming when applicable
- Keep selectors simple

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Formatting
- `refactor:` Code restructuring
- `test:` Adding tests
- `chore:` Maintenance

---

### Based on Flowmora Browser

Papstation Browser is based on Flowmora Browser, which is also licensed under the MIT License.

---

Thank you for contributing! 🙏