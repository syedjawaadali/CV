# Syed Jawaad Ali - Professional Portfolio

A sleek, modern, fluid, and interactive 3D-styled portfolio designed to showcase data engineering, analytics, and software development skills. Built with React, Tailwind CSS, and Framer Motion.

## 🚀 Features

*   **Fluid Scrolling & Parallax**: Replaced traditional static pages with a vertical, dashboard-like fluid layout featuring 3D scroll-linked animations.
*   **Recruiter-Friendly**: Clear navigation and calls to action guiding recruiters through the profile.
*   **Responsive & Performant**: Fully responsive layout optimized for mobile (native scrolling instead of heavy gesture-based swiping), tablet, and desktop viewing.
*   **Tech Stack**: Built using React 19, Vite, Tailwind CSS v4, and Framer Motion.

## 🛠️ Architecture & Modularity

The application is structured logically to be easily appendable:
- **`App.tsx`**: Contains the main layout and all section components (`HeroSection`, `AboutSection`, `ExperienceSection`, `ProjectsSection`, `SkillsSection`). You can easily append new sections by creating a new React component and dropping it into the `main` tag.
- **`vite.config.ts`**: Configured with `base: '/CV/'` specifically for GitHub Pages deployment.
- **`.github/workflows/deploy.yml`**: GitHub Actions workflow ready to deploy on any push to the `main` branch.

## 💻 Local Development

Follow these steps to set up the project locally on your machine.

### Prerequisites

*   Node.js (v20+ recommended)
*   npm or yarn

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/syedjawaadali/CV.git
    cd CV
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the development server**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:3000`.

## 🌐 Deployment to GitHub Pages

This project includes everything you need to deploy directly to GitHub Pages via GitHub Actions.

### Step 1: Add your Screenshot
1. Take a screenshot of your finished portfolio.
2. Save it as `screenshot.png` and place it inside the `public/` directory in this project (`public/screenshot.png`). This enables social media preview cards (LinkedIn, Twitter).

### Step 2: Configure GitHub Repository Settings
1. Go to your repository on GitHub (`syedjawaadali/CV`).
2. Navigate to **Settings** > **Pages** (under the "Code and automation" section).
3. Under **Build and deployment**, set the **Source** dropdown to **GitHub Actions**. (Do not select 'Deploy from a branch').

### Step 3: Push your code
Once the settings are updated, simply commit and push your code to the `main` branch. 
```bash
git add .
git commit -m "Deploy fluid dashboard portfolio"
git push origin main
```
This will automatically trigger the `.github/workflows/deploy.yml` workflow and deploy your site!

### Troubleshooting Deployment
*   **"Node 20 is being deprecated" / "The operation was canceled"**: The included `deploy.yml` explicitly uses `actions/setup-node@v4` and stable deployment actions which resolve recent deprecation warnings.
*   **Blank page on deployment**: Ensure that your repository name exactly matches the `base` in `vite.config.ts`. If your repository is named `CV`, the base must be `/CV/`.
*   **Missing Icons/Images**: Ensure images are placed in the `public` folder and referenced correctly in the HTML/code without relative dots (e.g. `/screenshot.png` not `./screenshot.png`).

## 📬 Contact

**Syed Jawaad Ali**
*   Email: [syedjawaadali@gmail.com](mailto:syedjawaadali@gmail.com)
*   LinkedIn: [linkedin.com/in/syedjawaadali](https://linkedin.com/in/syedjawaadali)

---

*Designed & Built by Syed Jawaad Ali © 2026*
