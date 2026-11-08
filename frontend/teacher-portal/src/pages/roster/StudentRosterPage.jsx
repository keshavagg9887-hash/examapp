import React, { useState, useEffect } from 'react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { UploadIcon } from '../../components/common/Icons'; // placeholder refresh icon
import StatusBadge from '../../components/common/StatusBadge';
import StudentTable from './StudentTable';
import './StudentRosterPage.css';

// Mock data – a list of registered students (including a lastLogin timestamp for demo)
const mockStudents = [
  {
    id: 's1',
    name: 'Alice Johnson',
    roll: 'CS2021001',
    department: 'Computer Science',
    semester: '4',
    batch: '2021',
    email: 'alice.johnson@example.com',
    lastLogin: null, // never logged in
  },
  {
    id: 's2',
    name: 'Bob Smith',
    roll: 'ME2021005',
    department: 'Mechanical Engineering',
    semester: '6',
    batch: '2020',
    email: 'bob.smith@example.com',
    lastLogin: '2026-11-04T10:30:00Z', // recent login (example)
  },
  {
    id: 's3',
    name: 'Carol Lee',
    roll: 'EE2021009',
    department: 'Electrical Engineering',
    semester: '5',
    batch: '2021',
    email: 'carol.lee@example.com',
    lastLogin: '2026-10-28T08:15:00Z', // older login
  },
];

// Derive a readable status from the lastLogin timestamp
const getStatus = (lastLogin) => {
  if (!lastLogin) return 'Never Logged In';
  const now = new Date();
  const loginDate = new Date(lastLogin);
  const diffMs = now - loginDate;
  const diffMins = diffMs / (1000 * 60);
  // Consider Online if the login was within the last 5 minutes
  if (diffMins <= 5) return 'Online';
  return 'Offline';
};

// Load (or reload) mock data and enrich with status
const loadData = () => {
  const enriched = mockStudents.map((s) => ({
    ...s,
    status: getStatus(s.lastLogin),
  }));
  console.log('StudentRosterPage: loaded students', enriched);
  return enriched;
};

export const StudentRosterPage = () => {
  console.log('StudentRosterPage render');

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ department: '', semester: '', batch: '' });
  const [loading, setLoading] = useState(true);

  // Initial load + polling every 30 seconds
  useEffect(() => {
    const init = () => {
      setStudents(loadData());
      setLoading(false);
    };
    init();
    const interval = setInterval(() => setStudents(loadData()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Manual refresh button
  const refresh = () => {
    setLoading(true);
    setStudents(loadData());
    setLoading(false);
  };

  // Apply search and dropdown filters
  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.roll.toLowerCase().includes(search.toLowerCase());
    const matchesDept = filters.department ? s.department === filters.department : true;
    const matchesSem = filters.semester ? s.semester === filters.semester : true;
    const matchesBatch = filters.batch ? s.batch === filters.batch : true;
    return matchesSearch && matchesDept && matchesSem && matchesBatch;
  });

  const departments = [...new Set(students.map((s) => s.department))];
  const semesters = [...new Set(students.map((s) => s.semester))];
  const batches = [...new Set(students.map((s) => s.batch))];

  return (
    <div className="roster-page"><p>Debug: StudentRosterPage rendered</p>
      <h2 className="page-title">Student Roster</h2>

      <div className="toolbar">
        <Input
          label="Search"
          type="text"
          placeholder="Name or Roll No."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="Department"
          options={[{ value: '', label: '' }, ...departments.map((d) => ({ value: d, label: d }))]}
          value={filters.department}
          onChange={(v) => setFilters((f) => ({ ...f, department: v }))}
        />
        <Select
          label="Semester"
          options={['', ...semesters].map((s) => ({ value: s, label: s }))}
          value={filters.semester}
          onChange={(v) => setFilters((f) => ({ ...f, semester: v }))}
        />
        <Select
          label="Batch"
          options={['', ...batches].map((b) => ({ value: b, label: b }))}
          value={filters.batch}
          onChange={(v) => setFilters((f) => ({ ...f, batch: v }))}
        />
        <Button size="sm" variant="primary" onClick={refresh} icon={UploadIcon}>Refresh</Button>
      </div>

      {loading ? <p>Loading students…</p> : <StudentTable students={filteredStudents} />}
    </div>
  );
};
