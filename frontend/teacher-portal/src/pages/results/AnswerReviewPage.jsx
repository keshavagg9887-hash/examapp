import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { MOCK_ANSWER_REVIEWS } from '../../data/mockResultsExtended';
import './AnswerReviewPage.css';

export const AnswerReviewPage = () => {
  const { examId, studentId } = useParams();
  const navigate = useNavigate();
  const reviews = (MOCK_ANSWER_REVIEWS[examId] && MOCK_ANSWER_REVIEWS[examId][studentId]) || [];

  return (
    <div className="answer-review-page">
      <h2 className="page-title">Answer Review – Exam {examId}, Student {studentId}</h2>
      <table className="answer-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Question</th>
            <th>Options</th>
            <th>Selected</th>
            <th>Correct</th>
            <th>Result</th>
            <th>Marks</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((q) => (
            <tr key={q.qNumber} className={q.selected === q.correct || (Array.isArray(q.selected) && Array.isArray(q.correct) && q.selected.sort().toString() === q.correct.sort().toString()) ? 'correct' : 'incorrect'}>
              <td>{q.qNumber}</td>
              <td>{q.text}</td>
              <td>
                <ul>
                  {q.options.map((opt) => (
                    <li key={opt.label}>{opt.label}. {opt.text}</li>
                  ))}
                </ul>
              </td>
              <td>{Array.isArray(q.selected) ? q.selected.join(', ') : q.selected}</td>
              <td>{Array.isArray(q.correct) ? q.correct.join(', ') : q.correct}</td>
              <td>{q.marksAwarded === q.maxMarks ? 'Correct' : q.marksAwarded === 0 ? 'Incorrect' : 'Partial'}</td>
              <td>{q.marksAwarded}/{q.maxMarks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button size="sm" variant="primary" onClick={() => navigate(-1)}>
        Back
      </Button>
    </div>
  );
};

