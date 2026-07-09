import { describe, it, expect } from 'vitest';
import { gradeAttempt, type GradableQuestion } from './grading';

const q = (over: Partial<GradableQuestion> & { id: string; type: GradableQuestion['type'] }): GradableQuestion => ({
  points: 10,
  options: [],
  ...over,
});

describe('gradeAttempt', () => {
  it('grades MCQ correctly and awards points', () => {
    const questions = [
      q({
        id: 'q1',
        type: 'MCQ',
        topic: 'Python',
        options: [
          { id: 'a', isCorrect: true },
          { id: 'b', isCorrect: false },
        ],
      }),
    ];
    const right = gradeAttempt(questions, [{ questionId: 'q1', selectedOptionIds: ['a'] }]);
    expect(right.score).toBe(10);
    expect(right.percent).toBe(100);
    const wrong = gradeAttempt(questions, [{ questionId: 'q1', selectedOptionIds: ['b'] }]);
    expect(wrong.score).toBe(0);
  });

  it('requires an exact set for MULTI_SELECT', () => {
    const questions = [
      q({
        id: 'q1',
        type: 'MULTI_SELECT',
        options: [
          { id: 'a', isCorrect: true },
          { id: 'b', isCorrect: true },
          { id: 'c', isCorrect: false },
        ],
      }),
    ];
    expect(gradeAttempt(questions, [{ questionId: 'q1', selectedOptionIds: ['a', 'b'] }]).score).toBe(10);
    expect(gradeAttempt(questions, [{ questionId: 'q1', selectedOptionIds: ['a'] }]).score).toBe(0);
    expect(gradeAttempt(questions, [{ questionId: 'q1', selectedOptionIds: ['a', 'b', 'c'] }]).score).toBe(0);
  });

  it('normalizes SHORT_ANSWER with an answer key, else flags review', () => {
    const keyed = gradeAttempt(
      [q({ id: 'q1', type: 'SHORT_ANSWER', correctText: 'DataFrame' })],
      [{ questionId: 'q1', textAnswer: '  dataframe ' }],
    );
    expect(keyed.score).toBe(10);
    const open = gradeAttempt(
      [q({ id: 'q1', type: 'SHORT_ANSWER' })],
      [{ questionId: 'q1', textAnswer: 'anything' }],
    );
    expect(open.needsReview).toBe(true);
    expect(open.answers[0]!.isCorrect).toBeNull();
  });

  it('produces a topic-level breakdown', () => {
    const questions = [
      q({ id: 'q1', type: 'MCQ', topic: 'Pandas', options: [{ id: 'a', isCorrect: true }] }),
      q({ id: 'q2', type: 'MCQ', topic: 'Pandas', options: [{ id: 'a', isCorrect: true }] }),
      q({ id: 'q3', type: 'MCQ', topic: 'Python', options: [{ id: 'a', isCorrect: true }] }),
    ];
    const res = gradeAttempt(questions, [
      { questionId: 'q1', selectedOptionIds: ['a'] },
      { questionId: 'q2', selectedOptionIds: [] }, // wrong
      { questionId: 'q3', selectedOptionIds: ['a'] },
    ]);
    const pandas = res.topics.find((t) => t.topic === 'Pandas');
    const python = res.topics.find((t) => t.topic === 'Python');
    expect(pandas).toEqual({ topic: 'Pandas', correct: 1, total: 2, percent: 50 });
    expect(python).toEqual({ topic: 'Python', correct: 1, total: 1, percent: 100 });
  });

  it('treats coding questions as review-needed', () => {
    const res = gradeAttempt([q({ id: 'q1', type: 'CODING' })], [{ questionId: 'q1', textAnswer: 'code' }]);
    expect(res.needsReview).toBe(true);
    expect(res.answers[0]!.pointsAwarded).toBe(0);
  });
});
