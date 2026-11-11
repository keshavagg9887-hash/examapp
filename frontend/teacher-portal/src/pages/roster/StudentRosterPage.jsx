import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { RefreshIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/common/Icons';
import StudentTable from './StudentTable';
import './StudentRosterPage.css';

export const StudentRosterPage = () => {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ department: '', semester: '', batch: '' });
  const [filterOptions, setFilterOptions] = useState({ departments: [], semesters: [], batches: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch students from backend with search, filters, and pagination
  const fetchStudents = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (filters.department) params.append('department', filters.department);
      if (filters.semester) params.append('semester', filters.semester);
      if (filters.batch) params.append('batch', filters.batch);
      params.append('page', String(targetPage));
      params.append('limit', String(limit));

      const response = await fetch(`/api/students?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch students.');
      }

      setStudents(data.students || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(data.page || 1);
      if (data.filterOptions) {
        setFilterOptions(data.filterOptions);
      }
    } catch (err) {
      console.error('[StudentRoster] Fetch error:', err);
      setError(err.message || 'Could not load student roster.');
    } finally {
      setLoading(false);
    }
  }, [search, filters, limit, page]);

  // Initial load
  useEffect(() => {
    fetchStudents(1);
  }, [search, filters]);

  // Auto-refresh periodically (every 30 seconds for online status updates)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStudents(page);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStudents, page]);

  // Manual refresh button
  const handleRefresh = () => {
    fetchStudents(page);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchStudents(newPage);
    }
  };

  const departmentOptions = [
    { value: '', label: 'All Departments' },
    ...(filterOptions.departments || []).map((d) => ({ value: d, label: d })),
  ];

  const semesterOptions = [
    { value: '', label: 'All Semesters' },
    ...(filterOptions.semesters || []).map((s) => ({ value: s, label: `Semester ${s}` })),
  ];

  const batchOptions = [
    { value: '', label: 'All Batches' },
    ...(filterOptions.batches || []).map((b) => ({ value: b, label: `Batch ${b}` })),
  ];

  return (
    <div className="roster-page">
      <div className="roster-header">
        <div>
          <h2 className="page-title">Student Roster</h2>
          <p className="roster-subtitle">
            Registered candidates across examinations, workstation presence, and departmental enrollment.
          </p>
        </div>
        <div className="roster-header-actions">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            icon={RefreshIcon}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="roster-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => fetchStudents(page)} className="roster-retry-btn">
            Retry
          </button>
        </div>
      )}

      {/* Query Filters Toolbar */}
      <div className="roster-toolbar">
        <div className="search-field-wrap">
          <Input
            label="Search Students"
            type="text"
            placeholder="Search by name, roll no, or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Select
          label="Department"
          options={departmentOptions}
          value={filters.department}
          onChange={(v) => {
            setFilters((f) => ({ ...f, department: v }));
            setPage(1);
          }}
        />

        <Select
          label="Semester"
          options={semesterOptions}
          value={filters.semester}
          onChange={(v) => {
            setFilters((f) => ({ ...f, semester: v }));
            setPage(1);
          }}
        />

        <Select
          label="Batch"
          options={batchOptions}
          value={filters.batch}
          onChange={(v) => {
            setFilters((f) => ({ ...f, batch: v }));
            setPage(1);
          }}
        />
      </div>

      {/* Table & Pagination */}
      {loading ? (
        <div className="roster-loading-state">
          <p>Loading student roster from database...</p>
        </div>
      ) : students.length > 0 ? (
        <>
          <div className="roster-table-wrapper">
            <StudentTable students={students} />
          </div>

          <div className="roster-pagination-bar">
            <div className="pagination-info">
              Showing <strong>{students.length}</strong> of <strong>{total}</strong> student{total === 1 ? '' : 's'}
            </div>
            <div className="pagination-controls">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                icon={ChevronLeftIcon}
              >
                Previous
              </Button>
              <span className="pagination-current-page">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
              >
                Next &rarr;
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="roster-empty-state">
          <p className="empty-title">No students found</p>
          <p className="empty-desc">
            No student participants match your current search and filter criteria. Try clearing filters or refreshing.
          </p>
          {(search || filters.department || filters.semester || filters.batch) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setFilters({ department: '', semester: '', batch: '' });
                setPage(1);
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
