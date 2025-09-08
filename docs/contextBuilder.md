Of course! Based on the transcript you provided, here is a detailed summary of the **Context Builder** feature in repoprompt 1.1.

### Summary of the Context Builder Feature

The Context Builder is a powerful new feature in repoprompt 1.1 designed to solve the problem of selecting the right files from a codebase to provide context to a Large Language Model (LLM). It uses AI to automatically identify and select the most relevant files for a given task, saving users time and dramatically reducing the number of tokens sent to the model.

---

### The Core Problem It Solves

*   **Manual Selection is Hard:** When working with a large or unfamiliar codebase, it's difficult for a developer to know which specific files are relevant to a particular task.
*   **Including Everything is Impossible:** Sending the entire codebase to an LLM is impractical due to token limits. In the demo, selecting the whole repository resulted in over 2 million tokens, which is far too large for any current model.
*   **Poor Context Leads to Poor Results:** Providing irrelevant or incomplete context to an LLM leads to hallucinations and lower-quality output.

### How It Works: The Key Concepts

1.  **Code Maps (The Foundation):**
    *   repoprompt first parses all supported files in your codebase (e.g., TypeScript, JavaScript, Python) to create **"Code Maps."**
    *   A Code Map is a structured summary of a file, extracting key elements like classes, methods, properties, constants, and enums.
    *   This gives the LLM a high-level, structured understanding of what each file and class can do, which helps prevent hallucinations.

2.  **AI-Powered Analysis:**
    *   Instead of you manually picking files, you provide a task or query.
    *   The Context Builder uses an LLM (the demo shows Gemini Flash and Gemini 2.5) to analyze the Code Maps of all files in your repository.
    *   It intelligently determines how relevant each file is to your specific task.

3.  **Efficient and Scalable Processing:**
    *   The feature is designed to handle very large repositories by splitting the analysis into parallel tasks.
    *   It dynamically load-balances the work, ensuring it can scale efficiently.
    *   After the initial analysis, a **refinement step** consolidates the results to create a final, concise list of the most important files.

### Key Features & Benefits

*   **Automated Context Selection:** Let the AI do the heavy lifting of finding relevant files, especially useful in codebases you don't know well.
*   **Drastic Token Reduction:** Reduces context from potentially millions of tokens (the whole repo) to a focused and manageable number (e.g., 15,000 in the demo).
*   **Improved Model Performance:** By providing highly relevant, focused context, you get much better and more accurate results from the LLM.
*   **Presets for Reusability:** You can save an AI-generated file selection as a **"preset."** This allows you to instantly reload that specific context for recurring tasks without having to run the analysis again. This is a major workflow improvement for switching between different tasks.

### The Workflow Demonstrated

1.  Eric shows that selecting all files manually is not feasible (2 million tokens).
2.  He uses the **Context Builder** with a model (Gemini Flash) to find relevant files.
3.  The tool analyzes the repo and returns a concise list of files.
4.  He **applies** this list, and the context size drops to a very reasonable 15,000 tokens.
5.  He then **saves this selection as a preset**, giving it a name.
6.  This allows him to deselect everything and then instantly reload the preset, re-selecting all the relevant files for that task.
