'use client';

import React, { useState } from 'react';
import { GraduationCap, BookOpen, Award, Users, Plus, Play, CheckCircle2, Clock, Search, Filter, FileText, AlertTriangle, ChevronRight, PawPrint, Download, Eye, Trash2, Edit, ShieldCheck, Video, HelpCircle, BarChart2, RefreshCw, Layers } from 'lucide-react';

interface Lesson {
  id: string;
  title: string;
  durationMinutes: number;
  type: 'video' | 'reading' | 'practical' | 'quiz';
  completed?: boolean;
}

interface Course {
  id: string;
  title: string;
  category: 'Safety & Handling' | 'Styling & Technique' | 'Operations' | 'Health & First Aid';
  level: 'Beginner' | 'Intermediate' | 'Mastery';
  totalDuration: string;
  modulesCount: number;
  enrolledCount: number;
  completionRate: number;
  status: 'Active' | 'Draft' | 'Archived';
  description: string;
  instructor: string;
  lastUpdated: string;
  lessons: Lesson[];
}

interface TraineeProgress {
  id: string;
  staffName: string;
  role: string;
  avatar: string;
  assignedCourses: number;
  completedCourses: number;
  overallScore: number;
  lastActive: string;
  certificationStatus: 'Compliant' | 'Renewal Due' | 'In Training';
  activeCourse: string;
  progressPercent: number;
}

const INITIAL_COURSES: Course[] = [
  {
    id: 'CRS-01',
    title: 'Canine Safety, Restraint & Stress-Free Handling',
    category: 'Safety & Handling',
    level: 'Beginner',
    totalDuration: '3.5 hrs',
    modulesCount: 5,
    enrolledCount: 14,
    completionRate: 92,
    status: 'Active',
    description: 'Essential handling protocols, bite prevention, brachycephalic & senior dog care, and bite-stick safety measures.',
    instructor: 'Elena Vance (Master Groomer)',
    lastUpdated: '2025-05-01',
    lessons: [
      { id: 'L1', title: 'Reading Canine Body Language & Fear Signals', durationMinutes: 30, type: 'video' },
      { id: 'L2', title: 'Slip Lead & Table Restraint Mechanics', durationMinutes: 45, type: 'practical' },
      { id: 'L3', title: 'Managing Aggressive & Highly Reactive Dogs', durationMinutes: 40, type: 'video' },
      { id: 'L4', title: 'Senior & Arthritic Pet Support Stations', durationMinutes: 35, type: 'reading' },
      { id: 'L5', title: 'Safety Protocol Exam & Certification Quiz', durationMinutes: 30, type: 'quiz' },
    ],
  },
  {
    id: 'CRS-02',
    title: 'Asian Fusion & Teddy Bear Face Scissor Techniques',
    category: 'Styling & Technique',
    level: 'Mastery',
    totalDuration: '6.0 hrs',
    modulesCount: 8,
    enrolledCount: 9,
    completionRate: 78,
    status: 'Active',
    description: 'Precision curved scissor work, muzzle rounding, flared legs, and modern luxury Asian Fusion finishes on Doodles & Poodles.',
    instructor: 'Kenji Sato (Stylist Director)',
    lastUpdated: '2025-05-10',
    lessons: [
      { id: 'L201', title: 'Shear Balance, Finger Grip & Ergonomics', durationMinutes: 40, type: 'video' },
      { id: 'L202', title: 'Fluff-Drying and Pre-Cut Coat Prep', durationMinutes: 50, type: 'practical' },
      { id: 'L203', title: 'Teddy Bear Head Geometry & Eye Clearing', durationMinutes: 60, type: 'video' },
      { id: 'L204', title: 'Beveling Paws & Bell-Bottom Legs', durationMinutes: 45, type: 'practical' },
      { id: 'L205', title: 'Final Finish & Photography Presentation', durationMinutes: 30, type: 'reading' },
    ],
  },
  {
    id: 'CRS-03',
    title: 'Pet First Aid, CPR & Emergency Response',
    category: 'Health & First Aid',
    level: 'Beginner',
    totalDuration: '4.0 hrs',
    modulesCount: 6,
    enrolledCount: 16,
    completionRate: 100,
    status: 'Active',
    description: 'CPR compression standards, quick-stop clotted nail protocol, heat exhaustion response, and vet dispatch escalation.',
    instructor: 'Dr. Sarah Lin, DVM',
    lastUpdated: '2025-04-18',
    lessons: [
      { id: 'L301', title: 'Emergency Vital Signs Assessment', durationMinutes: 35, type: 'video' },
      { id: 'L302', title: 'Cardiopulmonary Resuscitation (CPR) Drills', durationMinutes: 60, type: 'practical' },
      { id: 'L303', title: 'Wound Care, Styptic & Quick Bleed Control', durationMinutes: 40, type: 'practical' },
      { id: 'L304', title: 'Seizure, Choking & Heatstroke Procedures', durationMinutes: 45, type: 'video' },
    ],
  },
  {
    id: 'CRS-04',
    title: 'Salon Sanitation, Barbicide & Tool Maintenance',
    category: 'Operations',
    level: 'Beginner',
    totalDuration: '2.0 hrs',
    modulesCount: 4,
    enrolledCount: 16,
    completionRate: 95,
    status: 'Active',
    description: 'OSHA compliance, blade sharpening cadence, ultrasonic cleaner protocols, and daily terminal disinfection.',
    instructor: 'Marcus Brody (Operations Lead)',
    lastUpdated: '2025-03-22',
    lessons: [
      { id: 'L401', title: 'Daily Tub & Kennel Sanitization Checklist', durationMinutes: 30, type: 'reading' },
      { id: 'L402', title: 'Clipper Blade Oiling, Cooling & Maintenance', durationMinutes: 30, type: 'practical' },
      { id: 'L403', title: 'Dryer Filter Cleaning & Fire Prevention', durationMinutes: 20, type: 'reading' },
    ],
  },
  {
    id: 'CRS-05',
    title: 'Client Intake, Coat Assessment & Up-selling Add-ons',
    category: 'Operations',
    level: 'Intermediate',
    totalDuration: '3.0 hrs',
    modulesCount: 4,
    enrolledCount: 11,
    completionRate: 64,
    status: 'Active',
    description: 'Setting realistic coat expectations, dematting waivers, skin consultation, and spa package recommendations.',
    instructor: 'Jessica Alba (Guest Services Manager)',
    lastUpdated: '2025-05-12',
    lessons: [
      { id: 'L501', title: 'The 5-Point Skin & Coat Pre-Check', durationMinutes: 40, type: 'video' },
      { id: 'L502', title: 'Communicating Matting & Shave-Down Policies', durationMinutes: 40, type: 'reading' },
      { id: 'L503', title: 'De-shedding & Ozone Spa Add-on Presentation', durationMinutes: 40, type: 'practical' },
    ],
  },
];

const INITIAL_TRAINEES: TraineeProgress[] = [
  {
    id: 'TR-01',
    staffName: 'Ashley Miller',
    role: 'Senior Groomer',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
    assignedCourses: 5,
    completedCourses: 5,
    overallScore: 98,
    lastActive: 'Today at 9:15 AM',
    certificationStatus: 'Compliant',
    activeCourse: 'Asian Fusion & Teddy Bear Face',
    progressPercent: 100,
  },
  {
    id: 'TR-02',
    staffName: 'Devon Vance',
    role: 'Junior Groomer',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
    assignedCourses: 5,
    completedCourses: 3,
    overallScore: 88,
    lastActive: 'Yesterday at 4:30 PM',
    certificationStatus: 'In Training',
    activeCourse: 'Asian Fusion & Teddy Bear Face',
    progressPercent: 65,
  },
  {
    id: 'TR-03',
    staffName: 'Chloe Bennett',
    role: 'Bather & Spa Assistant',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
    assignedCourses: 4,
    completedCourses: 2,
    overallScore: 91,
    lastActive: '2 days ago',
    certificationStatus: 'In Training',
    activeCourse: 'Canine Safety, Restraint & Handling',
    progressPercent: 75,
  },
  {
    id: 'TR-04',
    staffName: 'Samir Patel',
    role: 'Lead Bather',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
    assignedCourses: 5,
    completedCourses: 4,
    overallScore: 94,
    lastActive: 'Today at 11:00 AM',
    certificationStatus: 'Renewal Due',
    activeCourse: 'Pet First Aid, CPR & Emergency',
    progressPercent: 90,
  },
];

export const LMSTab: React.FC<{ systemSettings?: any; saveSettingsToDb?: (updates: any) => void }> = ({ systemSettings, saveSettingsToDb }) => {
  const [activeSubTab, setActiveSubTab] = useState<'courses' | 'trainees' | 'certifications' | 'compliance'>('courses');
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [trainees, setTrainees] = useState<TraineeProgress[]>(INITIAL_TRAINEES);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [isLessonPreviewOpen, setIsLessonPreviewOpen] = useState(false);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  // New Course Form State
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseCategory, setNewCourseCategory] = useState<Course['category']>('Safety & Handling');
  const [newCourseLevel, setNewCourseLevel] = useState<Course['level']>('Beginner');
  const [newCourseDuration, setNewCourseDuration] = useState('3.0 hrs');
  const [newCourseInstructor, setNewCourseInstructor] = useState('UnSaid Memories Academy');
  const [newCourseDescription, setNewCourseDescription] = useState('');

  const handleCreateCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseTitle.trim()) return;

    const newCourse: Course = {
      id: `CRS-0${courses.length + 1}`,
      title: newCourseTitle,
      category: newCourseCategory,
      level: newCourseLevel,
      totalDuration: newCourseDuration,
      modulesCount: 4,
      enrolledCount: 0,
      completionRate: 0,
      status: 'Active',
      description: newCourseDescription || 'Professional curriculum module for salon staff.',
      instructor: newCourseInstructor,
      lastUpdated: new Date().toISOString().split('T')[0],
      lessons: [
        { id: 'L-NEW-1', title: 'Introduction & Foundations', durationMinutes: 30, type: 'video' },
        { id: 'L-NEW-2', title: 'Core Protocol & Step-by-Step Practical', durationMinutes: 45, type: 'practical' },
        { id: 'L-NEW-3', title: 'Quality Assurance & Assessment Quiz', durationMinutes: 20, type: 'quiz' },
      ],
    };

    setCourses([newCourse, ...courses]);
    setIsAddCourseModalOpen(false);
    setNewCourseTitle('');
    setNewCourseDescription('');
  };

  const filteredCourses = courses.filter((c) => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.instructor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || c.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & LMS Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 border border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] tabular-nums font-semibold uppercase bg-primary text-primary-foreground">
              Academy OS
            </span>
            <span className="text-[13px] tabular-nums text-muted-foreground">v3.2 Enterprise</span>
          </div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground mt-1">
            Learning Management System (LMS)
          </h1>
          <p className="text-[13px] text-muted-foreground tabular-nums mt-0.5">
            Internal staff training, safety certifications, grooming mastery, and salon compliance tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddCourseModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[13px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Course</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] tabular-nums uppercase tracking-wider">Active Courses</span>
            <BookOpen className="w-4 h-4 text-foreground" />
          </div>
          <div className="text-2xl tabular-nums font-semibold text-foreground">{courses.length}</div>
          <div className="text-[10px] tabular-nums text-muted-foreground mt-1">
            Across 4 academy disciplines
          </div>
        </div>

        <div className="bg-card border border-border p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] tabular-nums uppercase tracking-wider">Staff Enrolled</span>
            <Users className="w-4 h-4 text-foreground" />
          </div>
          <div className="text-2xl tabular-nums font-semibold text-foreground">16 Trainees</div>
          <div className="text-[10px] tabular-nums text-success font-semibold mt-1">
            100% active staff participating
          </div>
        </div>

        <div className="bg-card border border-border p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] tabular-nums uppercase tracking-wider">Avg Pass Rate</span>
            <Award className="w-4 h-4 text-foreground" />
          </div>
          <div className="text-2xl tabular-nums font-semibold text-foreground">91.4%</div>
          <div className="text-[10px] tabular-nums text-muted-foreground mt-1">
            +4.2% from last quarter
          </div>
        </div>

        <div className="bg-card border border-border p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] tabular-nums uppercase tracking-wider">Safety Compliance</span>
            <ShieldCheck className="w-4 h-4 text-foreground" />
          </div>
          <div className="text-2xl tabular-nums font-semibold text-success">96.8%</div>
          <div className="text-[10px] tabular-nums text-muted-foreground mt-1">
            1 CPR renewal due this month
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveSubTab('courses')}
          className={`px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
            activeSubTab === 'courses'
              ? 'bg-primary text-primary-foreground border-border'
              : 'bg-card text-foreground border-border hover:border-border'
          }`}
        >
          Course Catalog ({courses.length})
        </button>
        <button
          onClick={() => setActiveSubTab('trainees')}
          className={`px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
            activeSubTab === 'trainees'
              ? 'bg-primary text-primary-foreground border-border'
              : 'bg-card text-foreground border-border hover:border-border'
          }`}
        >
          Staff &amp; Trainee Progress ({trainees.length})
        </button>
        <button
          onClick={() => setActiveSubTab('certifications')}
          className={`px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
            activeSubTab === 'certifications'
              ? 'bg-primary text-primary-foreground border-border'
              : 'bg-card text-foreground border-border hover:border-border'
          }`}
        >
          Certifications &amp; Badges
        </button>
        <button
          onClick={() => setActiveSubTab('compliance')}
          className={`px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
            activeSubTab === 'compliance'
              ? 'bg-primary text-primary-foreground border-border'
              : 'bg-card text-foreground border-border hover:border-border'
          }`}
        >
          OSHA &amp; Safety Audits
        </button>
      </div>

      {/* VIEW 1: COURSES CATALOG */}
      {activeSubTab === 'courses' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card p-3 border border-border">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search courses, techniques, or instructors..."
                className="w-full pl-9 pr-3 py-1.5 text-[13px] border border-border focus:border-border focus:outline-hidden tabular-nums"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-[11px] tabular-nums text-muted-foreground uppercase">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-[13px] border border-border px-2.5 py-1.5 bg-card tabular-nums focus:border-border focus:outline-hidden cursor-pointer"
              >
                <option value="All">All Categories</option>
                <option value="Safety & Handling">Safety &amp; Handling</option>
                <option value="Styling & Technique">Styling &amp; Technique</option>
                <option value="Health & First Aid">Health &amp; First Aid</option>
                <option value="Operations">Operations</option>
              </select>
            </div>
          </div>

          {/* Courses Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCourses.map((course) => (
              <div
                key={course.id}
                className="bg-card border border-border p-4 flex flex-col justify-between hover:border-border transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 text-[10px] tabular-nums font-semibold uppercase bg-muted/40 text-foreground border border-border">
                      {course.category}
                    </span>
                    <span
                      className={`text-[10px] tabular-nums font-semibold uppercase px-2 py-0.5 border ${
                        course.level === 'Mastery'
                          ? 'bg-primary/5 text-primary border-primary/20'
                          : course.level === 'Intermediate'
                          ? 'bg-primary/5 text-primary border-primary/20'
                          : 'bg-success/10 text-success border-success/20'
                      }`}
                    >
                      {course.level}
                    </span>
                  </div>

                  <h3 className="font-semibold text-sm text-foreground group-hover:underline line-clamp-2">
                    {course.title}
                  </h3>

                  <p className="text-[13px] text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                    {course.description}
                  </p>

                  {/* Modules count & duration */}
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border text-center tabular-nums text-[13px]">
                    <div className="bg-muted/40 p-1.5 border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Duration</div>
                      <div className="font-semibold text-foreground">{course.totalDuration}</div>
                    </div>
                    <div className="bg-muted/40 p-1.5 border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Lessons</div>
                      <div className="font-semibold text-foreground">{course.lessons.length}</div>
                    </div>
                    <div className="bg-muted/40 p-1.5 border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Pass Rate</div>
                      <div className="font-semibold text-foreground">{course.completionRate}%</div>
                    </div>
                  </div>

                  <div className="mt-3 text-[11px] text-muted-foreground tabular-nums">
                    Instructor: <span className="font-semibold text-foreground">{course.instructor}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setSelectedCourse(course);
                      setActiveLesson(course.lessons[0] || null);
                      setIsLessonPreviewOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Launch Curriculum</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedCourse(course);
                      setIsLessonPreviewOpen(true);
                    }}
                    className="text-muted-foreground/70 hover:text-foreground p-1 transition-colors cursor-pointer"
                    title="View Course Syllabus"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: STAFF & TRAINEE PROGRESS */}
      {activeSubTab === 'trainees' && (
        <div className="bg-card border border-border overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 tabular-nums text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="p-3">Staff Member</th>
                <th className="p-3">Role</th>
                <th className="p-3">Assigned / Done</th>
                <th className="p-3">Current Active Course</th>
                <th className="p-3">Progress</th>
                <th className="p-3">Avg Score</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[13px] tabular-nums">
              {trainees.map((trainee) => (
                <tr key={trainee.id} className="hover:bg-muted/40/80 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={trainee.avatar}
                        alt={trainee.staffName}
                        className="w-7 h-7 rounded-full object-cover border border-border"
                      />
                      <div>
                        <div className="font-semibold text-foreground">{trainee.staffName}</div>
                        <div className="text-[10px] text-muted-foreground">{trainee.lastActive}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-foreground">{trainee.role}</td>
                  <td className="p-3 font-semibold text-foreground">
                    {trainee.completedCourses} / {trainee.assignedCourses}
                  </td>
                  <td className="p-3 text-foreground max-w-xs truncate">{trainee.activeCourse}</td>
                  <td className="p-3 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted/40 border border-border overflow-hidden">
                        <div
                          className="h-full bg-black transition-all"
                          style={{ width: `${trainee.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold">{trainee.progressPercent}%</span>
                    </div>
                  </td>
                  <td className="p-3 font-semibold text-foreground">{trainee.overallScore}%</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase border ${
                        trainee.certificationStatus === 'Compliant'
                          ? 'bg-success/10 text-success border-success/20'
                          : trainee.certificationStatus === 'Renewal Due'
                          ? 'bg-warning/10 text-warning border-warning/20'
                          : 'bg-primary/5 text-primary border-primary/20'
                      }`}
                    >
                      {trainee.certificationStatus}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => alert(`Assigned refresher modules to ${trainee.staffName}`)}
                      className="px-2 py-1 text-[10px] font-semibold uppercase bg-card border border-border hover:border-border text-foreground cursor-pointer transition-colors"
                    >
                      Assign Course
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 3: CERTIFICATIONS & BADGES */}
      {activeSubTab === 'certifications' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-card border border-border p-5 space-y-3">
            <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center border border-border">
              <Award className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground uppercase">Certified Canine First Responder</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed tabular-nums">
              Awarded upon 100% completion of CPR, bleeding control, and shock resuscitation protocols.
            </p>
            <div className="pt-2 border-t border-border flex items-center justify-between text-[13px] tabular-nums">
              <span className="text-muted-foreground">Holders:</span>
              <span className="font-semibold text-foreground">16 Active Staff</span>
            </div>
            <button
              onClick={() => alert('Certificate template exported as PDF')}
              className="w-full py-1.5 bg-muted/40 hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal text-foreground border border-border text-[13px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Export Certificate Template
            </button>
          </div>

          <div className="bg-card border border-border p-5 space-y-3">
            <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center border border-border">
              <PawPrint className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground uppercase">Master Scissor Stylist Badge</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed tabular-nums">
              Awarded upon passing the Asian Fusion &amp; Teddy Bear Face practical review with 90%+ score.
            </p>
            <div className="pt-2 border-t border-border flex items-center justify-between text-[13px] tabular-nums">
              <span className="text-muted-foreground">Holders:</span>
              <span className="font-semibold text-foreground">4 Senior Stylists</span>
            </div>
            <button
              onClick={() => alert('Certificate template exported as PDF')}
              className="w-full py-1.5 bg-muted/40 hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal text-foreground border border-border text-[13px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Export Certificate Template
            </button>
          </div>

          <div className="bg-card border border-border p-5 space-y-3">
            <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center border border-border">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground uppercase">OSHA Salon Safety &amp; Disinfection</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed tabular-nums">
              Mandatory annual credential covering chemical handling, sterilization, and blower fire safety.
            </p>
            <div className="pt-2 border-t border-border flex items-center justify-between text-[13px] tabular-nums">
              <span className="text-muted-foreground">Holders:</span>
              <span className="font-semibold text-foreground">16 Active Staff</span>
            </div>
            <button
              onClick={() => alert('Certificate template exported as PDF')}
              className="w-full py-1.5 bg-muted/40 hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal text-foreground border border-border text-[13px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Export Certificate Template
            </button>
          </div>
        </div>
      )}

      {/* VIEW 4: OSHA & COMPLIANCE LOG */}
      {activeSubTab === 'compliance' && (
        <div className="space-y-4">
          <div className="bg-card border border-border p-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="font-semibold text-sm text-foreground uppercase">Mandatory Staff Compliance Audit</h3>
                <p className="text-[13px] text-muted-foreground tabular-nums">UnSaid Memories - Frisco &amp; Plano Salons</p>
              </div>
              <span className="px-2.5 py-1 text-[13px] tabular-nums font-semibold uppercase bg-success/10 text-success border border-success/20">
                100% Audit Ready
              </span>
            </div>

            <div className="mt-4 space-y-3 tabular-nums text-[13px]">
              <div className="flex items-center justify-between p-3 bg-muted/40 border border-border">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <div>
                    <div className="font-semibold text-foreground">Safety Data Sheets (SDS) Review</div>
                    <div className="text-[11px] text-muted-foreground">Shampoos, ear flushes, and sanitizers updated</div>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">Verified May 2025</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/40 border border-border">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <div>
                    <div className="font-semibold text-foreground">First Aid Station &amp; Eye Wash Station Drill</div>
                    <div className="text-[11px] text-muted-foreground">Conducted with all morning &amp; evening shifts</div>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">Verified April 2025</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/40 border border-border">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <div>
                    <div className="font-semibold text-foreground">Pet CPR Refresher Recertification</div>
                    <div className="text-[11px] text-muted-foreground">1 bather staff due for renewal within 14 days</div>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-warning">Due May 28, 2025</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW COURSE */}
      {isAddCourseModalOpen && (
        <div className="fixed inset-0 z-50 bg-foreground/[0-9]0 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card max-w-lg w-full p-6 border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-foreground" />
                <h3 className="text-sm font-semibold uppercase text-foreground">Create Academy Course</h3>
              </div>
              <button
                onClick={() => setIsAddCourseModalOpen(false)}
                className="text-muted-foreground/70 hover:text-foreground tabular-nums text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4 text-[13px] tabular-nums">
              <div>
                <label className="block font-semibold uppercase text-foreground mb-1">Course Title *</label>
                <input
                  type="text"
                  required
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  placeholder="e.g. Scissor Mastery for Goldendoodles"
                  className="w-full p-2 border border-border focus:border-border focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-foreground mb-1">Category</label>
                  <select
                    value={newCourseCategory}
                    onChange={(e) => setNewCourseCategory(e.target.value as any)}
                    className="w-full p-2 border border-border bg-card focus:border-border focus:outline-hidden cursor-pointer"
                  >
                    <option value="Safety & Handling">Safety &amp; Handling</option>
                    <option value="Styling & Technique">Styling &amp; Technique</option>
                    <option value="Health & First Aid">Health &amp; First Aid</option>
                    <option value="Operations">Operations</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold uppercase text-foreground mb-1">Skill Level</label>
                  <select
                    value={newCourseLevel}
                    onChange={(e) => setNewCourseLevel(e.target.value as any)}
                    className="w-full p-2 border border-border bg-card focus:border-border focus:outline-hidden cursor-pointer"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Mastery">Mastery</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-foreground mb-1">Estimated Duration</label>
                  <input
                    type="text"
                    value={newCourseDuration}
                    onChange={(e) => setNewCourseDuration(e.target.value)}
                    placeholder="e.g. 4.5 hrs"
                    className="w-full p-2 border border-border focus:border-border focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-semibold uppercase text-foreground mb-1">Instructor / Lead</label>
                  <input
                    type="text"
                    value={newCourseInstructor}
                    onChange={(e) => setNewCourseInstructor(e.target.value)}
                    placeholder="e.g. Elena Vance"
                    className="w-full p-2 border border-border focus:border-border focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase text-foreground mb-1">Course Description</label>
                <textarea
                  rows={3}
                  value={newCourseDescription}
                  onChange={(e) => setNewCourseDescription(e.target.value)}
                  placeholder="Outline what staff members will learn and key deliverables..."
                  className="w-full p-2 border border-border focus:border-border focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsAddCourseModalOpen(false)}
                  className="px-3.5 py-2 border border-border hover:border-border text-foreground text-[13px] font-semibold uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[13px] font-semibold uppercase tracking-wider cursor-pointer"
                >
                  Publish to Academy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LESSON & SYLLABUS VIEWER */}
      {isLessonPreviewOpen && selectedCourse && (
        <div className="fixed inset-0 z-50 bg-foreground/[0-9]0 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card max-w-3xl w-full p-6 border border-border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-border">
              <div>
                <span className="px-2 py-0.5 text-[10px] tabular-nums font-semibold uppercase bg-muted/40 text-foreground border border-border">
                  {selectedCourse.category} · {selectedCourse.level}
                </span>
                <h3 className="text-base font-semibold uppercase text-foreground mt-1">
                  {selectedCourse.title}
                </h3>
                <p className="text-[13px] text-muted-foreground tabular-nums mt-0.5">
                  Instructor: {selectedCourse.instructor} · Total: {selectedCourse.totalDuration}
                </p>
              </div>
              <button
                onClick={() => setIsLessonPreviewOpen(false)}
                className="text-muted-foreground/70 hover:text-foreground tabular-nums text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Lesson video mock player */}
            <div className="bg-card text-white p-6 border border-border text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-card/10 flex items-center justify-center mx-auto text-white">
                <Play className="w-6 h-6 ml-0.5" />
              </div>
              <h4 className="font-semibold text-sm">
                {activeLesson ? activeLesson.title : selectedCourse.lessons[0]?.title}
              </h4>
              <p className="text-[13px] text-muted-foreground/70 tabular-nums">
                Interactive Video Module &amp; High-Definition Practical Demonstration
              </p>
            </div>

            {/* Lessons Syllabus */}
            <div>
              <h4 className="text-[13px] font-semibold uppercase tracking-wider text-foreground mb-2 tabular-nums">
                Curriculum Modules ({selectedCourse.lessons.length} Lessons)
              </h4>
              <div className="divide-y divide-border border border-border tabular-nums text-[13px]">
                {selectedCourse.lessons.map((lesson, idx) => (
                  <div
                    key={lesson.id}
                    onClick={() => setActiveLesson(lesson)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                      activeLesson?.id === lesson.id ? 'bg-muted/40 font-semibold' : 'hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-foreground">{lesson.title}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{lesson.type} Module</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{lesson.durationMinutes} min</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/70" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <button
                onClick={() => alert(`Certificate issued for ${selectedCourse.title}!`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted/40 hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal text-foreground border border-border text-[13px] font-semibold uppercase transition-colors cursor-pointer"
              >
                <Award className="w-3.5 h-3.5" />
                <span>Mark as Completed &amp; Issue Badge</span>
              </button>

              <button
                onClick={() => setIsLessonPreviewOpen(false)}
                className="px-4 py-1.5 bg-primary text-primary-foreground text-[13px] font-semibold uppercase cursor-pointer"
              >
                Close Curriculum
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
