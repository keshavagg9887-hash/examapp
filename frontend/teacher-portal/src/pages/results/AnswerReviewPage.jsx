// AnswerReviewPage – retained for compatibility; actual review is now inside StudentResultPage.
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import './AnswerReviewPage.css';

export const AnswerReviewPage = () => {
  const { examId, participantId } = useParams();
  const navigate = useNavigate();
  return (
    <div>
      <Button size="sm" onClick={() => navigate(-1)}>← Back</Button>
      <p style={{ marginTop: '1rem', color: '#64748b' }}>
        Answer review is now embedded in the student result page.
      </p>
    </div>
  );
};

export default AnswerReviewPage;
