# Negotium

A beautiful, minimal to-do list application featuring smooth animations, intelligent date management, and a modern design that helps you stay organized and productive.

## 💭 Why Negotium?

While powerful tools like Trello and Vikunja excel at managing complex projects and long-term planning, sometimes you just need a simple, focused space for your daily tasks. That's why I built Negotium, a straightforward to-do list for today and tomorrow. Nothing more, nothing less.

Built with Svelte for speed and simplicity. No overwhelming features, no endless project boards, no complexity. Just a clean interface for your daily workflow.

## ✨ Features

### Core Functionality
- ✅ **Add, complete, and delete tasks** with smooth animations
- 📅 **Today & Tomorrow lists** - Plan ahead with separate task lists
- 🔄 **Automatic task migration** - Tomorrow's tasks automatically move to Today when a new day begins
- 🎯 **Drag and drop reordering** - Organize tasks by dragging them into position
- 💾 **Persistent storage** - All tasks saved locally in your browser
- 📊 **Task statistics** - See remaining and completed tasks at a glance

## 🚀 Getting Started

### Quick Start with Docker (Recommended)

Pull and run the pre-built Docker image:

```bash
# Pull the image
docker pull ghcr.io/aculix/negotium:main

# Run the container
docker run -d -p 3000:80 --name negotium ghcr.io/aculix/negotium:main
```

Then open `http://localhost:3000` in your browser.

To stop the container:
```bash
docker stop negotium
docker rm negotium
```

### Manual Installation

If you prefer to run the application locally without Docker:

1. Clone the repository:
```bash
git clone <repository-url>
cd negotium
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open `http://localhost:3000` in your browser

#### Build for Production

```bash
npm run build
```

The optimized files will be in the `dist` directory.

## 📖 How to Use

### Managing Tasks
- **Add a task**: Type in the input field and press Enter
- **Complete a task**: Click the checkbox next to the task
- **Delete a task**: Hover over a task and click the delete icon
- **Reorder tasks**: Click and drag any task to a new position
- **Clear input**: Press Escape to clear the input field

### Date Management
- **Switch between Today and Tomorrow**: Click the date button in the header
- **Plan ahead**: Add tasks to Tomorrow's list before you need them
- **Automatic migration**: When a new day begins, Tomorrow's tasks automatically become Today's tasks
- **Separate lists**: Today and Tomorrow maintain independent task lists

### Theme Toggle
- Click the sun/moon icon in the header to switch themes
- Your preference is saved automatically and restored on reload
- Respects system dark mode preference on first visit

### Keyboard Shortcuts
- **Enter**: Add task (when input is focused)
- **Escape**: Clear input field
- **Space/Enter**: Toggle task completion (when task is focused)
- **Delete/Backspace**: Delete task (when task is focused)

## 💾 Data Storage

All data is stored locally in your browser using localStorage:
- **Tasks**: Separate storage keys for each date (`negotium-tasks-<date>`)
- **Theme**: Your theme preference (`negotium-theme`)
- **No server required**: Everything runs entirely client-side
- **Privacy first**: Your data never leaves your device

## 📄 License

MIT License - Free for personal and commercial use.

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues and pull requests.
