const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const InterviewModel = require('../models/Interview');
const GeminiService = require('../services/gemini');
// MAX questions per mock interview session
const MAX_QUESTIONS = 20;

// Helper to read client-provided API key from multiple header names
const readClientApiKey = (req) => {
  return req.headers['x-gemini-api-key'] || req.headers['x-gemini-api-key'.toLowerCase()];
};

// @route   POST api/interviews
// @desc    Start a new mock interview session and get the first question
// @access  Private
router.post('/', auth, async (req, res) => {
  const { role, type, difficulty } = req.body;
  const clientApiKey = readClientApiKey(req);

  if (!role || !type || !difficulty) {
    return res.status(400).json({ message: 'Please specify role, type, and difficulty.' });
  }

  try {
    // 1. Generate the first question
    const aiQuestion = await GeminiService.generateQuestion(role, type, difficulty, [], clientApiKey);
    const questionText = aiQuestion.questionText || "Tell me about your experience with programming.";

    // 2. Create the interview session
    const newInterview = await InterviewModel.create({
      userId: req.user.id,
      role,
      type,
      difficulty,
      status: 'active',
      questions: [{
        questionText: questionText,
        userAnswer: '',
        feedback: null
      }],
      overallScore: 0,
      overallFeedback: ''
    });

    res.status(201).json(newInterview);
  } catch (err) {
    console.error('Error starting interview:', err.message);
    res.status(500).json({ message: 'Server error starting interview session' });
  }
});

// @route   POST api/interviews/:id/answer
// @desc    Submit answer to active question and get feedback + next question or final summary
// @access  Private
router.post('/:id/answer', auth, async (req, res) => {
  const { answer } = req.body;
  const interviewId = req.params.id;

  if (answer === undefined || answer === null) {
    return res.status(400).json({ message: 'Answer is required' });
  }

  try {
    const interview = await InterviewModel.findById(interviewId);
    
    if (!interview) {
      return res.status(404).json({ message: 'Interview session not found' });
    }

    if (interview.userId !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to access this session' });
    }

    if (interview.status !== 'active') {
      return res.status(400).json({ message: 'This interview session is already completed' });
    }

    const currentQuestions = interview.questions || [];
    const activeQuestionIndex = currentQuestions.findIndex(q => !q.userAnswer);

    if (activeQuestionIndex === -1) {
      return res.status(400).json({ message: 'No active question awaiting response' });
    }

    const currentQuestion = currentQuestions[activeQuestionIndex];
    const clientApiKey = readClientApiKey(req);

    // 1. Evaluate the answer using Gemini
    const evaluation = await GeminiService.evaluateAnswer(
      interview.role,
      interview.type,
      interview.difficulty,
      currentQuestion.questionText,
      answer,
      clientApiKey
    );

    // 2. Update the active question with the answer and AI feedback
    currentQuestion.userAnswer = answer;
    currentQuestion.feedback = {
      score: evaluation.score || 70,
      comments: evaluation.comments || 'No comments available.',
      betterAnswer: evaluation.betterAnswer || 'No model response available.'
    };

    // 3. Determine if interview is finished
    const questionsCount = currentQuestions.length;
    let nextStep = {};

    if (questionsCount >= MAX_QUESTIONS) {
      // Session finished! Compute overall score and summary feedback
      interview.status = 'completed';
      
      const overall = await GeminiService.generateOverallFeedback(
        interview.role,
        interview.type,
        interview.difficulty,
        currentQuestions,
        clientApiKey
      );

      interview.overallScore = overall.overallScore || 75;
      interview.overallFeedback = overall.overallFeedback || 'Completed.';
      
      nextStep = {
        status: 'completed',
        feedback: currentQuestion.feedback,
        overallScore: interview.overallScore,
        overallFeedback: interview.overallFeedback
      };
    } else {
      // Session continues! Generate next question
      const pastQuestions = currentQuestions.map(q => q.questionText);
      const nextAiQuestion = await GeminiService.generateQuestion(
        interview.role,
        interview.type,
        interview.difficulty,
        pastQuestions,
        clientApiKey
      );

      const nextQuestionText = nextAiQuestion.questionText || "Tell me about a time you solved a hard technical problem.";
      
      // Push the new question placeholder to the session
      currentQuestions.push({
        questionText: nextQuestionText,
        userAnswer: '',
        feedback: null
      });

      nextStep = {
        status: 'active',
        feedback: currentQuestion.feedback,
        nextQuestion: nextQuestionText
      };
    }

    // 4. Save updates to database
    interview.questions = currentQuestions;
    await InterviewModel.findByIdAndUpdate(interviewId, interview);

    // Re-fetch to return latest data state
    const updatedInterview = await InterviewModel.findById(interviewId);
    
    res.json({
      ...nextStep,
      interview: updatedInterview
    });

  } catch (err) {
    console.error('Error submitting answer:', err.message);
    res.status(500).json({ message: 'Server error processing candidate answer' });
  }
});

// @route   GET api/interviews/history
// @desc    Get user interview history
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const history = await InterviewModel.find({ userId: req.user.id });
    res.json(history);
  } catch (err) {
    console.error('Error fetching history:', err.message);
    res.status(500).json({ message: 'Server error fetching history records' });
  }
});

// @route   GET api/interviews/history/:id
// @desc    Get single interview details
// @access  Private
router.get('/history/:id', auth, async (req, res) => {
  try {
    const interview = await InterviewModel.findById(req.params.id);
    
    if (!interview) {
      return res.status(404).json({ message: 'Interview session not found' });
    }

    if (interview.userId !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to view this session' });
    }

    res.json(interview);
  } catch (err) {
    console.error('Error fetching interview details:', err.message);
    res.status(500).json({ message: 'Server error fetching interview log' });
  }
});

// @route   DELETE api/interviews/:id
// @desc    Delete a specific interview session
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const interview = await InterviewModel.findById(req.params.id);
    
    if (!interview) {
      return res.status(404).json({ message: 'Interview session not found' });
    }

    if (interview.userId !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to delete this session' });
    }

    await InterviewModel.findByIdAndDelete(req.params.id);
    res.json({ message: 'Interview session deleted successfully' });
  } catch (err) {
    console.error('Error deleting interview:', err.message);
    res.status(500).json({ message: 'Server error deleting interview record' });
  }
});

// @route   POST api/interviews/resume
// @desc    Analyze resume content and generate critique + custom tailored questions
// @access  Private
router.post('/resume', auth, async (req, res) => {
  const { resumeText } = req.body;
  if (!resumeText || resumeText.trim() === '') {
    return res.status(400).json({ message: 'Resume text is required for analysis' });
  }

  try {
    const clientApiKey = readClientApiKey(req);
    const analysisResults = await GeminiService.analyzeResume(resumeText, clientApiKey);
    res.json(analysisResults);
  } catch (err) {
    console.error('Error analyzing resume:', err.message);
    res.status(500).json({ message: 'Server error parsing resume details' });
  }
});

// @route   POST api/interviews/coach-chat
// @desc    Interact with AI interview coach chat
// @access  Private
router.post('/coach-chat', auth, async (req, res) => {
  const { message, chatHistory } = req.body;
  if (!message || message.trim() === '') {
    return res.status(400).json({ success: false, message: 'Message text is required' });
  }

  try {
    const clientApiKey = readClientApiKey(req);
    const replyResults = await GeminiService.chatWithCoach(message, chatHistory || [], clientApiKey);
    res.status(200).json({ success: true, reply: replyResults.reply });
  } catch (err) {
    console.error('Coach chat AI error:', {
      message: err.message,
      status: err.response?.status
    });
    res.status(500).json({ success: false, message: err.message || 'Server error during chat dialogue' });
  }
});

// @route   POST api/interviews/mcq
// @desc    Start a new MCQ session and get the first question
// @access  Private
router.post('/mcq', auth, async (req, res) => {
  const { role, type, difficulty } = req.body;
  const clientApiKey = readClientApiKey(req);

  if (!role || !type || !difficulty) {
    return res.status(400).json({ message: 'Please specify role, type, and difficulty.' });
  }

  try {
    const aiQuestion = await GeminiService.generateMcqQuestion(role, type, difficulty, [], clientApiKey);

    const newInterview = await InterviewModel.create({
      userId: req.user.id,
      role,
      type,
      format: 'mcq',
      difficulty,
      status: 'active',
      questions: [{
        questionText: aiQuestion.questionText,
        options: aiQuestion.options,
        correctAnswer: aiQuestion.correctAnswer,
        userAnswer: '',
        feedback: {
          betterAnswer: aiQuestion.explanation
        }
      }],
      overallScore: 0,
      overallFeedback: ''
    });

    res.status(201).json(newInterview);
  } catch (err) {
    console.error('Error starting MCQ session:', err.message);
    res.status(500).json({ message: 'Server error starting MCQ session' });
  }
});

// @route   POST api/interviews/:id/mcq-answer
// @desc    Submit MCQ answer and get next question
// @access  Private
router.post('/:id/mcq-answer', auth, async (req, res) => {
  const { answer } = req.body;
  const interviewId = req.params.id;

  if (answer === undefined || answer === null) {
    return res.status(400).json({ message: 'Answer is required' });
  }

  try {
    const interview = await InterviewModel.findById(interviewId);
    
    if (!interview || interview.userId !== req.user.id) {
      return res.status(404).json({ message: 'Session not found' });
    }
    if (interview.status !== 'active') {
      return res.status(400).json({ message: 'Session completed' });
    }

    const currentQuestions = interview.questions || [];
    const activeQuestionIndex = currentQuestions.findIndex(q => !q.userAnswer);
    if (activeQuestionIndex === -1) {
      return res.status(400).json({ message: 'No active question' });
    }

    const currentQuestion = currentQuestions[activeQuestionIndex];
    const clientApiKey = readClientApiKey(req);

    // Evaluate
    const isCorrect = answer === currentQuestion.correctAnswer;
    currentQuestion.userAnswer = answer;
    
    if (!currentQuestion.feedback) {
      currentQuestion.feedback = {};
    }
    currentQuestion.feedback.score = isCorrect ? 100 : 0;
    currentQuestion.feedback.comments = isCorrect ? 'Correct!' : 'Incorrect.';
    
    const questionsCount = currentQuestions.length;
    // Let's set max questions to 10 for MCQ
    const MAX_MCQ_QUESTIONS = 10;
    let nextStep = {};

    if (questionsCount >= MAX_MCQ_QUESTIONS) {
      interview.status = 'completed';
      
      const score = Math.round(
        currentQuestions.reduce((acc, q) => acc + (q.feedback?.score || 0), 0) / currentQuestions.length
      );
      
      interview.overallScore = score;
      interview.overallFeedback = `### MCQ Test Completed\nYou scored ${score}/100. Review your correct and incorrect answers in the history tab.`;
      
      nextStep = {
        status: 'completed',
        feedback: currentQuestion.feedback,
        overallScore: interview.overallScore,
        overallFeedback: interview.overallFeedback
      };
    } else {
      const pastQuestions = currentQuestions.map(q => q.questionText);
      const nextAiQuestion = await GeminiService.generateMcqQuestion(
        interview.role,
        interview.type,
        interview.difficulty,
        pastQuestions,
        clientApiKey
      );

      currentQuestions.push({
        questionText: nextAiQuestion.questionText,
        options: nextAiQuestion.options,
        correctAnswer: nextAiQuestion.correctAnswer,
        userAnswer: '',
        feedback: {
          betterAnswer: nextAiQuestion.explanation
        }
      });

      nextStep = {
        status: 'active',
        feedback: currentQuestion.feedback,
        nextQuestion: nextAiQuestion.questionText
      };
    }

    interview.questions = currentQuestions;
    await InterviewModel.findByIdAndUpdate(interviewId, interview);

    const updatedInterview = await InterviewModel.findById(interviewId);
    res.json({ ...nextStep, interview: updatedInterview });
  } catch (err) {
    console.error('Error submitting MCQ answer:', err.message);
    res.status(500).json({ message: 'Server error processing answer' });
  }
});

module.exports = router;
