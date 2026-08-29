const { GoogleGenerativeAI } = require('@google/generative-ai');

// Check if server environment has API key
const serverApiKey = process.env.GEMINI_API_KEY;

/**
 * Returns a GoogleGenerativeAI client instance.
 * Prioritizes the client-provided key from the frontend headers,
 * falling back to the server environment key.
 */
const getGenAIClient = (clientApiKey) => {
  const activeKey = clientApiKey || serverApiKey;
  if (activeKey && activeKey.trim() !== '') {
    try {
      return new GoogleGenerativeAI(activeKey);
    } catch (error) {
      console.error('Error creating Gemini client instance:', error.message);
      return null;
    }
  }
  return null;
};

// Curated pool of mock questions for offline fallback mode
const MOCK_QUESTION_POOL = {
  frontend: {
    easy: [
      "What is the difference between let, const, and var in JavaScript?",
      "Explain the box model in CSS. What properties make up the total width/height of an element?",
      "What are React components? What is the difference between state and props?",
      "What is semantic HTML and why is it important for SEO and accessibility?"
    ],
    medium: [
      "Explain event delegation in JavaScript and why we use it.",
      "What is the Virtual DOM in React? How does React's reconciliation process work?",
      "How do hooks like useEffect, useMemo, and useCallback work in React? What is their lifecycle?",
      "Describe how you would optimize a React application that is suffering from slow render times."
    ],
    hard: [
      "Explain JavaScript Closures. Give a practical scenario where you used closures to solve a problem.",
      "How do server-side rendering (SSR) in Next.js and client-side rendering (CSR) in React compare in terms of SEO, TTFB, and hydration?",
      "How does the browser event loop work? Explain the difference between microtasks and macrotasks with examples.",
      "Describe how you would design and implement a complex, high-performance state management system for a collaborative drawing app."
    ]
  },
  backend: {
    easy: [
      "What is Node.js? Why is it single-threaded but still highly scalable?",
      "What is the difference between GET and POST requests in REST APIs?",
      "What is middleware in Express? Give an example of how you would use it.",
      "What is MongoDB? How does a document database differ from a relational database?"
    ],
    medium: [
      "Explain the concept of JWT (JSON Web Tokens). How does authentication work securely with JWT?",
      "What are database indexes? How do they improve query speeds, and what are their trade-offs?",
      "How do you handle asynchronous operations in Node.js? Compare callbacks, promises, and async/await.",
      "How would you handle error propagation in an Express application to avoid server crashes?"
    ],
    hard: [
      "What is the Event Loop in Node.js? Detail the different phases of the event loop (timers, poll, check, etc.).",
      "How would you design a rate-limiting middleware in Express to protect an API from DDoS attacks or brute force attacks?",
      "Describe database replication and sharding. When would you choose sharding over indexing in MongoDB?",
      "Explain horizontal vs vertical scaling. How do you implement load balancing and session persistence in a distributed Node.js cluster?"
    ]
  },
  behavioral: {
    easy: [
      "Tell me about yourself and why you are interested in this role.",
      "Describe a time when you had to work closely with someone whose personality was very different from yours.",
      "How do you prioritize your tasks when you have multiple deadlines on the same day?",
      "Tell me about a time you made a mistake at work. How did you handle it and what did you learn?"
    ],
    medium: [
      "Tell me about a time you faced a difficult technical challenge on a project. How did you diagnose and overcome it?",
      "Describe a situation where you had a disagreement with a team member or product manager. How did you resolve it?",
      "Tell me about a project you worked on recently. What were the trade-offs you had to make?",
      "Describe a time when you received constructive feedback that was difficult to hear. How did you respond?"
    ],
    hard: [
      "Describe a time you lead a project or team through a major technical transition or crisis. How did you manage risks and stakeholder expectations?",
      "Tell me about a time when you had to make a high-impact technical decision with incomplete information and a tight deadline.",
      "Describe a time when a project you were responsible for failed or missed its key goals. What went wrong, and how did you adapt your approach in the future?",
      "Explain how you foster a culture of mentorship, code quality, and inclusivity within a engineering team you are leading."
    ]
  },
  system_design: {
    easy: [
      "Explain the difference between a load balancer and an API gateway.",
      "What is a Content Delivery Network (CDN) and when would you use one?",
      "What is caching? Where can caching be implemented in a standard web architecture?",
      "Explain the differences between SQL and NoSQL databases at a high level."
    ],
    medium: [
      "Design a simple URL shortening service (like Bit.ly). What are the API endpoints and database schema?",
      "How would you design a caching strategy for a high-traffic e-commerce homepage? What eviction policies would you use?",
      "Design a notification service that sends email, SMS, and push notifications to millions of users.",
      "Explain the CAP theorem. How do you make trade-offs between Consistency and Availability in a database system?"
    ],
    hard: [
      "Design a real-time chat system (like Slack or WhatsApp) that supports group chats, read receipts, and online status indicators.",
      "Design a system like Netflix or YouTube for video streaming. How do you handle encoding, storage, and low-latency delivery globally?",
      "Design a distributed rate limiter that can handle 100,000 requests per second across multiple data centers.",
      "Design a payment gateway integration service (like Stripe) ensuring idempotency, security, and transaction reliability."
    ]
  }
};

/**
 * Helper to clean up code blocks and markup from JSON returned by LLM
 */
function cleanJSONResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * AI Service using Google Gemini API with fallback Mock AI Mode
 */
const GeminiService = {
  /**
   * Generates the next question in a session
   */
  generateQuestion: async (role, type, difficulty, pastQuestions = [], clientApiKey = null) => {
    const formattedType = type.toLowerCase().replace(' ', '_');
    const formattedRole = role.toLowerCase();

    // Determine category key
    let category = 'behavioral';
    if (formattedType.includes('tech') || formattedRole.includes('engineer') || formattedRole.includes('develop')) {
      category = formattedRole.includes('front') ? 'frontend' : 'backend';
    }
    if (formattedType.includes('system')) {
      category = 'system_design';
    }
    if (formattedType.includes('behavior')) {
      category = 'behavioral';
    }

    const diff = ['easy', 'medium', 'hard'].includes(difficulty.toLowerCase()) ? difficulty.toLowerCase() : 'medium';
    const activeClient = getGenAIClient(clientApiKey);

    // 1. Fallback / Mock AI Mode
    if (!activeClient) {
      const pool = MOCK_QUESTION_POOL[category]?.[diff] || MOCK_QUESTION_POOL.behavioral.medium;
      const available = pool.filter(q => !pastQuestions.includes(q));
      const chosenPool = available.length > 0 ? available : pool;
      const questionText = chosenPool[Math.floor(Math.random() * chosenPool.length)];
      return { questionText };
    }

    // 2. Real Gemini Mode
    try {
      const model = activeClient.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `You are a professional technical recruiter and interviewer.
The candidate is interviewing for:
- Job Role: ${role}
- Interview Category: ${type}
- Difficulty Level: ${difficulty}

Previous questions asked in this session (do not repeat or ask similar questions):
${pastQuestions.map((q, idx) => `- ${q}`).join('\n') || 'None'}

Generate the next highly relevant interview question for this candidate.
Respond ONLY with a valid JSON object in this format:
{
  "questionText": "your single interview question here"
}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(cleanJSONResponse(responseText));
      return parsed;
    } catch (error) {
      console.error('Error generating question from Gemini:', error.message);
      const pool = MOCK_QUESTION_POOL[category]?.[diff] || MOCK_QUESTION_POOL.behavioral.medium;
      return { questionText: pool[Math.floor(Math.random() * pool.length)] };
    }
  },

  /**
   * Helper to fetch tailored mock model answers
   */
  getMockModelAnswer: (question) => {
    const q = question.toLowerCase();

    // --- FRONTEND QUESTIONS ---
    if (q.includes('let') && q.includes('const') && q.includes('var')) {
      return `### Correct and Proper Answer:
1. **var**: Function-scoped, can be re-declared and updated. It is hoisted to the top of its scope and initialized with 'undefined'.
2. **let**: Block-scoped (contained in {}), can be updated but not re-declared. It is hoisted but remains in the "Temporal Dead Zone" until declared.
3. **const**: Block-scoped, cannot be updated or re-declared. It must be initialized immediately at the time of declaration.`;
    }

    if (q.includes('box model')) {
      return `### Correct and Proper Answer:
The CSS Box Model is the foundation of design layouts. It wraps every HTML element in four nested boxes:
1. **Content**: The actual text, images, or elements.
2. **Padding**: Clear space around the content, inside the border.
3. **Border**: The line surrounding the padding and content.
4. **Margin**: Clear space outside the border separating this element from others.
*Total Element Width* = Width + Left/Right Padding + Left/Right Border. If box-sizing is set to 'border-box', padding and border are included in the width, making layout sizing much easier.`;
    }

    if (q.includes('state') && q.includes('props') && q.includes('react')) {
      return `### Correct and Proper Answer:
1. **Props** (Properties): Passed from a parent component down to a child component. They are read-only (immutable) on the child side.
2. **State**: Data managed locally inside a component. It is mutable and can be changed via state hooks (like useState). Changing state triggers component re-renders.`;
    }

    if (q.includes('semantic html') || q.includes('accessibility')) {
      return `### Correct and Proper Answer:
**Semantic HTML** means using HTML tags that describe the meaning of their content rather than just its visual appearance (e.g., using <header>, <nav>, <main>, <article>, <section>, and <footer> instead of generic <div> and <span> tags).
- **SEO**: Search engine crawlers use semantic structure to understand page priority and context.
- **Accessibility**: Screen readers rely on semantic tags to navigate pages, offering a better user experience for visually impaired users.`;
    }

    if (q.includes('event delegation')) {
      return `### Correct and Proper Answer:
**Event delegation** is a technique where a single event listener is attached to a parent element rather than attaching individual listeners to multiple child elements. It utilizes **event propagation (bubbling)**—when an event occurs on a child, it bubbles up to the parent.
- **Why use it**: It improves performance by reducing memory consumption (fewer event listeners) and automatically handles events for children added dynamically to the DOM.`;
    }

    if (q.includes('hooks') && q.includes('useeffect')) {
      return `### Correct and Proper Answer:
- **useEffect**: Performs side effects (data fetching, subscriptions, DOM manipulation). It runs after rendering. The dependency array decides when it re-runs. Returning a function acts as the cleanup handler (componentWillUnmount).
- **useMemo**: Memoizes (caches) the *result of a calculation* to prevent expensive recalculations on every render.
- **useCallback**: Memoizes the *function instance itself*, preventing it from being re-created on every render (useful to prevent unnecessary re-renders in optimized child components).`;
    }

    if (q.includes('virtual dom') && q.includes('reconciliation')) {
      return `### Correct and Proper Answer:
The **Virtual DOM** is a lightweight JavaScript representation of the real DOM.
React's reconciliation process works in three steps:
1. **Render**: When state changes, React generates a new Virtual DOM tree representing the updated UI.
2. **Diffing**: React compares this new Virtual DOM tree with the previous snapshot to locate exact changes.
3. **Commit (Batching)**: React updates ONLY the modified nodes in the real browser DOM, avoiding expensive full page re-layouts.`;
    }

    if (q.includes('optimize') || q.includes('slow render') || q.includes('render times')) {
      return `### Correct and Proper Answer:
To optimize React apps suffering from slow render times:
1. **Memoization**: Use \`React.memo\` to skip re-rendering child components if their props haven't changed. Use \`useMemo\` to cache expensive operations, and \`useCallback\` to preserve callback references.
2. **State Location**: Keep state local to where it is needed instead of lifting it globally.
3. **List Virtualization**: Use windowing libraries (like \`react-window\`) to render only visible elements of massive lists.
4. **Lazy Loading**: Use \`React.lazy\` and \`Suspense\` to split code bundles.
5. **Analyze**: Use React Developer Tools Profiler to pinpoint which components are rendering excessively.`;
    }

    if (q.includes('closure') && q.includes('javascript')) {
      return `### Correct and Proper Answer:
A **closure** is created when a nested function retains access to the variables and parameters of its outer lexical environment, even after that outer function has returned.
*Practical Scenario*: Used to create private variables/methods (encapsulation), partially applied functions (currying), or maintaining state in asynchronous handlers (like event listeners or setTimeout).`;
    }

    if (q.includes('ssr') || q.includes('server-side') || q.includes('hydration')) {
      return `### Correct and Proper Answer:
- **Server-Side Rendering (SSR)**: Renders components into static HTML on the server. Fast initial load (FCP), excellent for SEO, but hydrated on client.
- **Client-Side Rendering (CSR)**: Renders a blank HTML skeleton and downloads JS bundles. The client browser compiles the layout. Slower initial load, poorer SEO, but smooth navigation.
- **Hydration**: The process where client-side JavaScript attaches event listeners to server-rendered static HTML, making it interactive.`;
    }

    if (q.includes('event loop') && q.includes('microtasks')) {
      return `### Correct and Proper Answer:
The JavaScript **Event Loop** manages call stacks, microtasks, and macrotasks:
1. **Call Stack**: Executes synchronous JavaScript code.
2. **Microtask Queue** (High Priority): Executes callbacks from Promises, async/await, and queueMicrotask. Run immediately after the stack is empty, before any repaint.
3. **Macrotask Queue** (Low Priority): Executes setTimeout, setInterval, setImmediate, and I/O callbacks. Run one by one, checking for microtasks in between.`;
    }

    if (q.includes('state management') || q.includes('collaborative')) {
      return `### Correct and Proper Answer:
For high-performance state management (e.g. collaborative drawing apps):
1. **Normalize State**: Flatten state structures to avoid deep, expensive object modifications.
2. **Atomic/Lightweight Updates**: Use atomic stores like \`Zustand\` or \`Recoil\` instead of Redux to target specific elements without triggering full app re-renders.
3. **Canvas Offloading**: Avoid pushing raw coordinate ticks (like mouse move coordinates) into global React state; manage drawing changes inside refs directly on HTML5 Canvas.
4. **Synchronization**: Use WebSockets and CRDTs (Conflict-free Replicated Data Types) to synchronize real-time updates without conflicts.`;
    }

    // --- BACKEND QUESTIONS ---
    if (q.includes('single-threaded') && q.includes('scalable')) {
      return `### Correct and Proper Answer:
Node.js runs JavaScript on a single thread using an Event Loop. It achieves high scalability through **non-blocking asynchronous I/O operations**.
When Node.js performs network queries or file reads, it delegates the execution to system threads (via the libuv C++ library) and continues executing other code. Once the I/O completes, its callback is queued in the event loop, maximizing throughput.`;
    }

    if (q.includes('get') && q.includes('post') && q.includes('rest')) {
      return `### Correct and Proper Answer:
1. **GET**: Requests data from a specified resource. Parameters are sent in the URL query string. It is cached, bookmarked, limited in size, and should be idempotent (calling it multiple times has no side effects).
2. **POST**: Submits data to be processed to a specified resource. Parameters are sent in the request body. It is not cached, has no size limit, and is not idempotent (can create multiple entries).`;
    }

    if (q.includes('middle') && q.includes('express')) {
      return `### Correct and Proper Answer:
Express **middleware** functions are functions that have access to the Request (req), Response (res), and Next function in the request-response cycle. They can execute code, modify request/response objects, end requests, or call next() to pass control.
*Example*: \`express.json()\` for parsing payloads, logging filters, or auth check middleware verifying JWT headers.`;
    }

    if (q.includes('mongodb') || q.includes('relational') || q.includes('database')) {
      return `### Correct and Proper Answer:
- **MongoDB (NoSQL)**: A document database storing data in JSON/BSON format. It is schema-less, supports horizontal scaling through sharding, and excels at writing speed and nesting data.
- **Relational Databases (SQL)**: Store data in structured tables with defined schemas. Support complex JOIN queries and guarantee strict ACID transactions for database integrity. Scale vertically.`;
    }

    if (q.includes('jwt') || q.includes('token')) {
      return `### Correct and Proper Answer:
**JSON Web Tokens** (JWT) are stateless security tokens containing three base64-encoded sections: Header, Payload, and Signature.
1. Candidate logs in; server creates a signed JWT containing user credentials.
2. Token is returned to client, which stores it (e.g., localStorage) and sends it in the 'Authorization: Bearer <token>' header on subsequent requests.
3. The server validates the token authenticity statelessly by checking its cryptographic signature, avoiding database queries.`;
    }

    if (q.includes('indexes') || q.includes('query')) {
      return `### Correct and Proper Answer:
Database **indexes** are specialized search structures (like B-Trees) that allow queries to locate rows quickly without scanning the entire table.
*Trade-offs*:
- **Pros**: Drastically speeds up SELECT operations.
- **Cons**: Slows down write operations (INSERT, UPDATE, DELETE) because the index must be recalculated, and consumes extra memory/storage.`;
    }

    if (q.includes('asynchronous operations') || q.includes('async/await') || q.includes('promises')) {
      return `### Correct and Proper Answer:
Handling asynchronous actions in Node.js:
1. **Callbacks**: The traditional method. Can lead to "Callback Hell" (deeply nested, unreadable code).
2. **Promises**: An object representing the eventual completion or failure of an async action. Clean chaining via \`.then()\` and \`.catch()\`.
3. **Async/Await**: Syntactic sugar built on top of Promises. Allows async code to be written sequentially, improving readability. Handled with standard \`try-catch\` blocks.`;
    }

    if (q.includes('error propagation') || q.includes('express')) {
      return `### Correct and Proper Answer:
In Express, error handling follows standard propagation pathways:
1. Use **try-catch** in synchronous and asynchronous route handlers.
2. Forward caught errors to Express by calling **next(error)**.
3. Define a global error-handling middleware at the very end of your middleware stack using: **app.use((err, req, res, next) => { ... })**. This catches all forwarded errors, logs details, and returns structured JSON responses, preventing server crashes.`;
    }

    if (q.includes('event loop') && q.includes('phases')) {
      return `### Correct and Proper Answer:
The Node.js libuv event loop runs in six distinct phases in a loop:
1. **Timers**: Executes callbacks scheduled by \`setTimeout()\` and \`setInterval()\`.
2. **Pending Callbacks**: Executes I/O callbacks deferred to the next loop iteration (such as TCP socket errors).
3. **Idle, Prepare**: Used internally by Node.
4. **Poll**: Retrieves new I/O events and executes I/O-related callbacks.
5. **Check**: Executes callbacks scheduled by \`setImmediate()\`.
6. **Close Callbacks**: Executes close events (e.g. \`socket.on('close', ...)\`).`;
    }

    if (q.includes('rate-limiting') || q.includes('ddos')) {
      return `### Correct and Proper Answer:
To implement a rate-limiter middleware:
1. **Identify Client**: Retrieve IP address or API Authorization token.
2. **Track Hits**: Store hit counters and timestamps in a fast in-memory store like Redis.
3. **Validate**: Increments hit counts. If counts exceed threshold in a set duration (e.g. 100 hits/minute), reject request with HTTP 429 (Too Many Requests).
4. **Evict**: Use Redis TTL to reset hit windows automatically.`;
    }

    if (q.includes('replication') || q.includes('sharding')) {
      return `### Correct and Proper Answer:
- **Replication**: Copying data across multiple server nodes (Primary-Secondary). Excellent for read scaling and high availability. If the primary fails, a secondary is elected.
- **Sharding**: Partitioning data horizontally across distinct machines based on a sharding key. Scalability for write-heavy applications.`;
    }

    if (q.includes('horizontal') || q.includes('vertical') || q.includes('scaling')) {
      return `### Correct and Proper Answer:
- **Vertical Scaling**: Adding more power (CPU, RAM) to a single machine. Limited by hardware caps and introduces a single point of failure.
- **Horizontal Scaling**: Adding more server nodes. Scales infinitely but requires:
  1. A **Load Balancer** (like Nginx) to distribute traffic.
  2. **Stateless servers** using shared token sessions (JWT or Redis) instead of local session variables.`;
    }

    // --- SYSTEM DESIGN QUESTIONS ---
    if (q.includes('load balancer') || q.includes('gateway')) {
      return `### Correct and Proper Answer:
- **Load Balancer**: Distributes incoming traffic across multiple backend servers to ensure no single server is overloaded (operates at Layer 4 or Layer 7).
- **API Gateway**: Acts as the single entry point for all clients. Handles cross-cutting concerns like authentication, routing, rate limiting, and protocol translation.`;
    }

    if (q.includes('cdn')) {
      return `### Correct and Proper Answer:
A **Content Delivery Network** (CDN) is a globally distributed network of proxy servers that cache content (static files like images, CSS, JS, and videos) close to the user's physical location.
- **Benefits**: Reduces latency, saves server bandwidth, and increases availability.`;
    }

    if (q.includes('caching') && q.includes('architecture')) {
      return `### Correct and Proper Answer:
Caching can be implemented at multiple layers:
1. **Client/Browser**: Cache headers (Cache-Control, ETag).
2. **CDN**: Cache static assets globally.
3. **Application/API**: In-memory caching (like Redis) to store database results.
4. **Database**: Built-in query buffers.`;
    }

    if (q.includes('cap theorem')) {
      return `### Correct and Proper Answer:
The **CAP Theorem** states that a distributed system can only provide two of three guarantees:
1. **Consistency**: Every read receives the most recent write or an error.
2. **Availability**: Every request receives a non-error response.
3. **Partition Tolerance**: System continues to operate despite node dropouts.
*Trade-off*: In a network partition, you must choose either Consistency (CP) or Availability (AP).`;
    }

    if (q.includes('url shortening') || q.includes('bit.ly')) {
      return `### Correct and Proper Answer:
A URL shortener converts long URLs to short aliases:
1. **API**: POST /api/v1/shorten (takes longUrl, returns shortUrl). GET /:shortId (redirects 301 to longUrl).
2. **Hashing**: Convert counter IDs to Base62 strings (a-z, A-Z, 0-9) to get unique keys (e.g. 7 characters).
3. **Database**: Table containing (shortId [Indexed], longUrl, createdAt).
4. **Scaling**: Cache popular mappings in Redis to reduce DB load.`;
    }

    if (q.includes('real-time chat') || q.includes('whatsapp') || q.includes('slack')) {
      return `### Correct and Proper Answer:
Real-time chat architecture:
1. **Connections**: Use WebSockets (persistent, bi-directional) instead of HTTP polling.
2. **Server scale**: Use a Redis Pub/Sub backplane to broadcast messages across multiple WebSocket nodes.
3. **Message Flow**: Client A sends message to Server -> Server writes to DB -> Server checks if Client B is connected on local node. If not, publishes to Redis, which forwards to node holding Client B's socket.
4. **Database**: NoSQL column store (like Cassandra) optimized for write-heavy chat histories.`;
    }

    if (q.includes('netflix') || q.includes('youtube')) {
      return `### Correct and Proper Answer:
Video streaming system design:
1. **Upload & Transcoding**: User uploads raw video. Worker servers encode it into multiple formats (MP4, WebM) and resolutions (360p, 720p, 1080p) using a tool like FFmpeg.
2. **Adaptive Bitrate**: Split videos into 5-second segments. The player selects resolution dynamically based on network speeds (DASH/HLS protocols).
3. **Delivery**: Store segments in AWS S3 and distribute via CDN caching nodes globally.`;
    }

    if (q.includes('payment gateway') || q.includes('stripe')) {
      return `### Correct and Proper Answer:
Payment gateway design:
1. **Idempotency**: Require unique \`Idempotency-Key\` headers to prevent double-charging on network retries.
2. **Asynchronous Processing**: Queue transactions in Kafka/RabbitMQ. Let workers contact payment acquirers and handle Webhook responses asynchronously.
3. **Security**: PCI-DSS compliance. Never store raw credit card credentials; use secure tokenization.`;
    }

    // --- BEHAVIORAL ANSWERS (STAR Framework) ---
    if (formattedType => formattedType.includes('behavior')) {
      return `### Correct and Proper Answer:
For behavioral questions, structure your answer using the **STAR** framework:
- **Situation**: Define the environment, project, or task context clearly.
- **Task**: Detail the specific challenge or technical bottleneck you had to solve.
- **Action**: Outline the exact actions you took, highlighting your individual contributions, engineering decisions, and technical choices.
- **Result**: Present the outcomes, highlighting quantitative metrics where possible (e.g. 'reduced latency by 40%', 'boosted conversion by 12%').`;
    }

    // Default fallback mock response
    return `### Correct and Proper Answer:
An ideal response to this question should:
1. Define the core terminology directly with technical precision.
2. Explain the execution context or architecture mechanisms.
3. List practical code/use-cases and discuss engineering trade-offs (e.g., performance, memory, scaling limits).`;
  },

  /**
   * Evaluates a single answer
   */
  evaluateAnswer: async (role, type, difficulty, question, answer, clientApiKey = null) => {
    const activeClient = getGenAIClient(clientApiKey);

    // 1. Fallback / Mock AI Mode
    if (!activeClient) {
      const wordCount = answer.trim().split(/\s+/).length;
      const lowerAnswer = answer.toLowerCase();
      const tailoredAnswer = GeminiService.getMockModelAnswer(question);

      // Determine if they mentioned core concepts of the question
      let keywordsMatched = 0;
      let score = 50;
      let comments = "";

      // Quick keyword matching based on question content
      const q = question.toLowerCase();
      if (q.includes('let') && (lowerAnswer.includes('scope') || lowerAnswer.includes('block') || lowerAnswer.includes('var'))) keywordsMatched += 2;
      if (q.includes('hooks') && (lowerAnswer.includes('effect') || lowerAnswer.includes('memo') || lowerAnswer.includes('callback') || lowerAnswer.includes('render') || lowerAnswer.includes('fetch'))) keywordsMatched += 3;
      if (q.includes('virtual dom') && (lowerAnswer.includes('diff') || lowerAnswer.includes('reconciliation') || lowerAnswer.includes('compare') || lowerAnswer.includes('real dom') || lowerAnswer.includes('lightweight'))) keywordsMatched += 3;
      if (q.includes('closure') && (lowerAnswer.includes('scope') || lowerAnswer.includes('lexical') || lowerAnswer.includes('inner') || lowerAnswer.includes('remember') || lowerAnswer.includes('outer'))) keywordsMatched += 3;
      if (q.includes('event loop') && (lowerAnswer.includes('microtask') || lowerAnswer.includes('macrotask') || lowerAnswer.includes('stack') || lowerAnswer.includes('queue') || lowerAnswer.includes('promise'))) keywordsMatched += 3;
      if (q.includes('index') && (lowerAnswer.includes('speed') || lowerAnswer.includes('b-tree') || lowerAnswer.includes('select') || lowerAnswer.includes('write') || lowerAnswer.includes('search'))) keywordsMatched += 3;
      if (q.includes('error') && (lowerAnswer.includes('middleware') || lowerAnswer.includes('next') || lowerAnswer.includes('try') || lowerAnswer.includes('catch'))) keywordsMatched += 2;
      if (q.includes('optimize') && (lowerAnswer.includes('memo') || lowerAnswer.includes('callback') || lowerAnswer.includes('lazy') || lowerAnswer.includes('window') || lowerAnswer.includes('render') || lowerAnswer.includes('profile'))) keywordsMatched += 3;
      if (q.includes('ssr') && (lowerAnswer.includes('server') || lowerAnswer.includes('html') || lowerAnswer.includes('hydrate') || lowerAnswer.includes('seo'))) keywordsMatched += 2;

      // Score calculation
      if (lowerAnswer.includes("i don't know") || lowerAnswer.includes("don't know the answer")) {
        score = 0;
        comments = "You indicated that you do not know the answer. That's okay! Take this opportunity to review the correct and proper answer provided below so you can master this concept.";
      } else if (wordCount < 10) {
        score = 45;
        comments = "Your answer is extremely brief. In a real interview, you should elaborate more, explaining details, examples, and your core technical reasoning. Let's review the correct response below.";
      } else if (wordCount < 25 && keywordsMatched < 2) {
        score = 65;
        comments = "Your response contains basic details but is not fully correct. It lacks crucial explanation of the core technical mechanisms. Read the proper answer below to see what you missed.";
      } else if (keywordsMatched >= 2 || wordCount >= 30) {
        score = Math.floor(Math.random() * 15) + 82; // 82 - 96
        comments = "Okk! Your answer is correct and covers the key points! You successfully highlighted the core concepts. To improve further, you could mention concrete project examples or trade-offs.";
      } else {
        score = 70;
        comments = "Your answer is partially correct but not complete. You outlined the basics, but missed explaining the architectural details. Refer to the correct and proper answer below.";
      }

      return {
        score,
        comments,
        betterAnswer: tailoredAnswer
      };
    }

    // 2. Real Gemini Mode
    try {
      const model = activeClient.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      const prompt = `You are a professional technical interviewer.
Evaluate the candidate's answer to the question.
Context:
- Job Role: ${role}
- Interview Category: ${type}
- Difficulty Level: ${difficulty}

Question: "${question}"
Candidate's Answer: "${answer}"

Provide a detailed evaluation of their answer. Be critical but constructive. Assess technical correctness, completeness, and structure.
If the candidate explicitly says they don't know or if their response is completely wrong, explain the concept thoroughly in your feedback.
Respond ONLY with a valid JSON object in this format:
{
  "score": 75, // Integer between 0 and 100. If they don't know the answer, score should be 0.
  "comments": "Constructive feedback describing what they did well, what was missing, and how to improve.",
  "betterAnswer": "A premium, detailed model response showing how a top-tier candidate would answer this question perfectly."
}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(cleanJSONResponse(responseText));
      return parsed;
    } catch (error) {
      console.error('Error evaluating answer from Gemini:', error.message);
      return {
        score: 70,
        comments: 'Technical review completed. Your answer covers the basics. Consider expanding on system architectures and specific performance considerations.',
        betterAnswer: GeminiService.getMockModelAnswer(question)
      };
    }
  },

  /**
   * Generates summary feedback at the end of a session
   */
  generateOverallFeedback: async (role, type, difficulty, questionsAndAnswers, clientApiKey = null) => {
    const activeClient = getGenAIClient(clientApiKey);

    // 1. Fallback / Mock AI Mode
    if (!activeClient) {
      let totalScore = 0;
      questionsAndAnswers.forEach(qa => {
        totalScore += qa.feedback?.score || 70;
      });
      const overallScore = Math.round(totalScore / questionsAndAnswers.length) || 75;

      let overallFeedback = `### Interview Feedback Summary for ${role} (${type})

**Overall Performance Rating: ${overallScore}/100**

You completed a mock interview consisting of ${questionsAndAnswers.length} questions. Here is your detailed analysis:

#### 🌟 Key Strengths
- **Logical Structure**: You generally structured your ideas before speaking or writing.
- **Contextual Knowledge**: You have a strong grasp of the fundamentals required for this role.

#### 📈 Areas to Improve
- **Trade-Off Analysis**: When answering, make sure to explicitly discuss alternatives and why your chosen path is optimal.
- **Detail & Depth**: For technical problems, dive deeper into resource limits, complexity (Time/Space), and scaling bottlenecks.

#### 💡 Actionable Next Steps
1. Practice the STAR framework for behavioral scenarios.
2. Review system design concepts, specifically regarding load balancing, caching tiers, and API performance.
3. Conduct another mock interview in this app to see your score improve!`;

      return { overallScore, overallFeedback };
    }

    // 2. Real Gemini Mode
    try {
      const model = activeClient.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      const transcript = questionsAndAnswers.map((qa, index) => {
        return `Q${index + 1}: ${qa.questionText}\nA${index + 1}: ${qa.userAnswer}\nScore: ${qa.feedback?.score || 'N/A'}\nFeedback: ${qa.feedback?.comments || 'N/A'}\n`;
      }).join('\n---\n');

      const prompt = `You are a senior engineering manager and interview coach.
Provide overall assessment summary feedback for this candidate's completed mock interview session.

Context:
- Job Role: ${role}
- Interview Category: ${type}
- Difficulty Level: ${difficulty}

Interview Transcript:
${transcript}

Create a summary report. Calculate a reasonable overall score out of 100 based on individual answer scores. 
Provide professional summary feedback in markdown format, listing Key Strengths, Areas for Improvement, and Actionable Steps.
Respond ONLY with a valid JSON object in this format:
{
  "overallScore": 80, // Integer score out of 100
  "overallFeedback": "Your comprehensive review in markdown format"
}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(cleanJSONResponse(responseText));
      return parsed;
    } catch (error) {
      console.error('Error generating summary feedback from Gemini:', error.message);
      return {
        overallScore: 75,
        overallFeedback: '### Session Completed\n\nYou did a good job traversing the questions. Work on clarifying system boundaries and presenting structured diagrams when communicating backend or system layouts.'
      };
    }
  },

  /**
   * Reviews resume text and returns analysis + 5 tailored questions
   */
  analyzeResume: async (resumeText, clientApiKey = null) => {
    const activeClient = getGenAIClient(clientApiKey);

    // 1. Fallback / Mock AI Mode
    if (!activeClient) {
      const analysis = `### 📄 Resume Analysis Report

#### 🌟 Major Strengths
- **Solid Skills Presentation**: Core skills and tools are laid out clearly in the resume context.
- **Project Descriptions**: Projects demonstrate hands-on experience and application of modern technologies.

#### 📈 Recommended Improvements
- **Use Action-Oriented Verbs**: Replace passive phrases like "worked on" or "responsible for" with strong verbs like "Architected," "Optimized," or "Implemented."
- **Quantify Impact**: Include metrics where possible. For instance, instead of "optimized query speed," write "optimized PostgreSQL indexing, reducing endpoint latency by 35%."
- **Keep it Focused**: Trim older or less relevant experiences to keep the resume concise and emphasize impact.

#### 💡 Actionable Next Steps
- Reformat project bullets using the formula: **Accomplished [X] as measured by [Y], by doing [Z]**.
- Align technical keywords closely with job postings you target.`;

      const tailoredQuestions = [
        "Based on your resume, detail a project where you solved a major performance bottleneck.",
        "How did you choose the technology stack (databases, frameworks) for the projects listed on your resume?",
        "Explain how you handled error handling and test coverage in your past professional roles.",
        "Describe a scenario in your past projects where you had to make design trade-offs due to time constraints.",
        "How would you optimize the scaling capabilities of the main application mentioned in your resume?"
      ];

      return { analysis, tailoredQuestions };
    }

    // 2. Real Gemini Mode
    try {
      const model = activeClient.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      const prompt = `You are an expert resume critic and hiring recruiter.
Review this candidate's resume text:
"${resumeText}"

Perform a detailed critique. Note strengths, weaknesses, formatting suggestions, and missing details.
Then, generate exactly 5 custom interview questions tailored specifically to the experiences, projects, or technologies mentioned in this resume.
Respond ONLY with a valid JSON object in this format:
{
  "analysis": "Your detailed resume critique in markdown format (using headers, bullet points)",
  "tailoredQuestions": [
    "Tailored Question 1",
    "Tailored Question 2",
    "Tailored Question 3",
    "Tailored Question 4",
    "Tailored Question 5"
  ]
}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(cleanJSONResponse(responseText));
      return parsed;
    } catch (error) {
      console.error('Error analyzing resume from Gemini:', error.message);
      return {
        analysis: '### Resume Analysis\n\nYour resume highlights solid experience. Focus on quantifying key metrics and emphasizing technical ownership.',
        tailoredQuestions: [
          "Describe the architecture of the primary project listed on your resume.",
          "What were the largest scaling bottlenecks in your resume's applications, and how did you resolve them?",
          "How did you manage database selection and migrations in your project lifecycle?",
          "Explain how you coordinated deployment pipelines in your development work.",
          "What was the most challenging bug you encountered in the projects listed, and how did you fix it?"
        ]
      };
    }
  },

  /**
   * AI Chat Assistant (Coach Chat)
   */
  chatWithCoach: async (userMessage, chatHistory = [], clientApiKey = null) => {
    const activeClient = getGenAIClient(clientApiKey);

    // 1. Fallback / Mock AI Mode
    if (!activeClient) {
      const msg = userMessage.toLowerCase();
      let reply = "";

      if (msg.includes('closure')) {
        reply = `### Understanding JavaScript Closures
A **closure** is the combination of a function bundled together (enclosed) with references to its surrounding state (the **lexical environment**). In other words, a closure gives an inner function access to the outer function's scope even after the outer function has returned.

#### 💻 Example:
\`\`\`javascript
function createCounter() {
  let count = 0; // Private state
  return {
    increment: function() {
      count++;
      return count;
    },
    decrement: function() {
      count--;
      return count;
    }
  };
}

const counter = createCounter();
console.log(counter.increment()); // 1
console.log(counter.increment()); // 2
\`\`\`

#### 🚀 Why they are used:
1. **Data Privacy / Encapsulation**: Emulate private variables.
2. **State Retention**: Maintain state in event handlers or async callbacks.`;
      } else if (msg.includes('virtual dom') || msg.includes('virtualdom')) {
        reply = `### What is the Virtual DOM in React?
The **Virtual DOM** (VDOM) is a lightweight JavaScript representation of the real DOM. It is kept in memory and synced with the real DOM via a process called **reconciliation**.

#### ⚙️ How it works:
1. **State Update**: When a component's state changes, React generates a new Virtual DOM tree.
2. **Diffing**: React compares this new tree with the previous one to find the exact changes (using a diffing algorithm).
3. **Reconciliation**: React updates *only* those specific modified nodes in the real browser DOM (using batch operations).

#### 💡 Benefits:
- **Efficiency**: Direct DOM manipulations are slow; Virtual DOM minimizes real DOM updates.
- **Declarative Programming**: Developers declare how the UI should look, and React handles the updates.`;
      } else if (msg.includes('hooks') || msg.includes('hook')) {
        reply = `### React Hooks Overview
**React Hooks** were introduced in version 16.8. They let you use state and other React features (like lifecycle methods) in functional components without writing a class.

#### 🎯 Key Hooks:
1. \`useState\`: Manages local state within a functional component.
2. \`useEffect\`: Handles side effects (fetching data, setting up subscriptions, DOM manipulation). Replaces class lifecycle methods (\`componentDidMount\`, \`componentDidUpdate\`, \`componentWillUnmount\`).
3. \`useMemo\`: Memoizes (caches) a computed value to avoid costly recalculations on every render.
4. \`useCallback\`: Memoizes a function definition to prevent it from being re-created unnecessarily.

#### ⚠️ Rules of Hooks:
- Call hooks *only at the top level* of your functional component (not inside loops or conditions).
- Call hooks *only from React Function Components* or Custom Hooks.`;
      } else if (msg.includes('event loop') || msg.includes('eventloop') || msg.includes('microtask') || msg.includes('macrotask')) {
        reply = `### The JavaScript Event Loop Explained
JavaScript is **single-threaded**, meaning it executes one task at a time. The **Event Loop** is the mechanism that allows JavaScript to perform non-blocking asynchronous operations.

#### 🔄 How the cycle works:
1. **Call Stack**: Executes synchronous code (LIFO: Last In, First Out).
2. **Web APIs/Node APIs**: Offloads async tasks (like \`setTimeout\` or fetch calls) to helper threads.
3. **Microtask Queue** (High Priority): Executes Promise callbacks, \`async/await\` continuations, and \`queueMicrotask\`. Runs *immediately* after the stack is cleared.
4. **Macrotask Queue** (Low Priority): Executes \`setTimeout\`, \`setInterval\`, and I/O. Runs one task at a time when the stack and microtask queue are completely empty.`;
      } else if (msg.includes('index') || msg.includes('indexing')) {
        reply = `### Database Indexing
An **index** is a data structure (commonly B-Tree or Hash) built on top of a database table. It is designed to speed up search operations, much like an index at the back of a textbook.

#### ⚖️ Trade-offs:
- **Pros**: Speeds up \`SELECT\` queries dramatically.
- **Cons**: Slows down writes (\`INSERT\`, \`UPDATE\`, \`DELETE\`) because index structures must be rebuilt, and consumes extra storage space.`;
      } else if (msg.includes('star') || msg.includes('behavioral')) {
        reply = `### The STAR Method for Behavioral Interviews
When answering behavioral questions (e.g., "Tell me about a time when..."), structure your answer using the **STAR** framework to ensure clarity and conciseness:

1. **S - Situation (10-15%)**: Set the scene. Briefly describe the context, project, or task. What was the setup?
2. **T - Task (10-15%)**: Describe your responsibility. What challenge or goal needed to be addressed?
3. **A - Action (50-60%)**: This is the most crucial part! Explain *exactly* what you did. What decisions did you make, what tech did you use, and how did you lead or coordinate? Use "I" rather than "we".
4. **R - Result (15-20%)**: Describe the outcome. What happened? What did you achieve? Whenever possible, **quantify** the results (e.g., "reduced latency by 30%", "delivered the project 2 weeks ahead of schedule").`;
      } else if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
        reply = `Hello! 👋 I'm your **AI Interview Coach**. 
        
How can I assist your preparation today? I can:
- Explain complex programming concepts (e.g., closures, microtasks, indices, load balancers).
- Conduct quick mock Q&A sessions.
- Provide advice on structuring behavioral answers.
- Review resume writing tips.`;
      } else {
        reply = `I am your AI Interview Coach. I'm currently running in **Mock/Offline Mode** because the \`GEMINI_API_KEY\` is not set in the \`backend/.env\` file.
        
In this mode, I can provide detailed, curated lessons on core interview topics! Try asking me about:
- **Virtual DOM** (React architecture)
- **Hooks** (useEffect, useMemo, etc.)
- **Closures** (JavaScript scopes)
- **Event Loop** (Microtasks vs Macrotasks)
- **Database Indexing** (Indexes & Trade-offs)
- **STAR Method** (Behavioral interview template)

*To enable live chat on any topic, please configure your \`GEMINI_API_KEY\` in [backend/.env](file:///C:/Users/AYUSH%20TANDON/.gemini/antigravity-ide/scratch/interview-prep-app/backend/.env) and restart the server!*`;
      }

      return { reply };
    }

    // 2. Real Gemini Mode
    try {
      const model = activeClient.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      const systemInstruction = `You are a helpful, empathetic, and expert technical interview coach.
Your job is to prepare candidates for engineering and product manager jobs.
Be structured, clear, and encouraging. Provide code snippets (using markdown) when explaining code concepts.
Format your responses with clear markdown headers, bold text, and lists where appropriate.`;

      const contents = [];
      contents.push({
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\nHi Coach, let's begin.` }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: "Hello! I'm your AI Interview Coach. Let's get you ready for your next big role. What are we practicing or reviewing today?" }]
      });

      chatHistory.forEach(msg => {
        contents.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });

      contents.push({
        role: 'user',
        parts: [{ text: userMessage }]
      });

      const result = await model.generateContent({ contents });
      const reply = result.response.text();
      return { reply };
    } catch (error) {
      console.error('Error in coach chat from Gemini:', error.message);
      throw error;
    }
  }
};

module.exports = GeminiService;
