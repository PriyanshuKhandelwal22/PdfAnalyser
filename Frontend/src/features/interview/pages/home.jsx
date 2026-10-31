import React, { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Briefcase, User, UploadCloud, Star } from 'lucide-react'
import '../style/home.scss'
import { useInterview } from '../hooks/useInterview.jsx'

const Home = () => {
    const [jobDescription, setJobDescription] = useState('')
    const [selfDescription, setSelfDescription] = useState('')
    const [resumeFileName, setResumeFileName] = useState(null)
    const [error, setError] = useState(null)

    const { generateReport, reports, loading, getAllReports } = useInterview()
    const navigate = useNavigate()
    const resumeInputRef = useRef(null)

    // Fetch existing reports when the page loads
    useEffect(() => {
        getAllReports()
    }, [])

    
    const handleResumeChange = (e) => {
        const file = e.target.files?.[0];

        setError(null);

        if (!file) {
            setResumeFileName(null);
            return;
        }

        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

        // Validate the extension and browser-reported MIME type.
        const isPdf =
            file.name.toLowerCase().endsWith(".pdf") &&
            file.type === "application/pdf";

        if (!isPdf) {
            setError("Please upload a PDF file only.");
            e.target.value = "";
            setResumeFileName(null);
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setError("Resume must be 5 MB or smaller.");
            e.target.value = "";
            setResumeFileName(null);
            return;
        }

        setResumeFileName(file.name);
    };


    const handleGenerateReport = async () => {
        setError(null)
        try {
            const resumeFile = resumeInputRef.current?.files?.[0]
            const data = await generateReport({ jobDescription, selfDescription, resumeFile })
            if (data?._id) {
                navigate(`/interview/${data._id}`)
            } else {
                setError('Failed to generate report. Please try again.')
            }
        } catch (err) {
            console.error('Generate report error:', err)
            setError(err.message || 'Something went wrong. Please try again.')
        }
    }

    if (loading) {
        return (
            <main className='loading-screen'>
                <h1>Generating your interview plan...</h1>
            </main>
        )
    }

    return (
        <div className='home-page'>

            {/* Page Header */}
            <header className='page-header'>
                <h1>Create Your Custom <span className='highlight'>Interview Plan</span></h1>
                <p>Let our AI analyze the job requirements and your unique profile to build a winning strategy.</p>
            </header>

            {/* Main Card */}
            <div className='interview-card'>
                <div className='interview-card__body'>

                    {/* Left Panel - Job Description */}
                    <div className='panel panel--left'>
                        <div className='panel__header'>
                            <span className='panel__icon'>
                                <Briefcase size={18} />
                            </span>
                            <h2>Target Job Description</h2>
                            <span className='badge badge--required'>Required</span>
                        </div>
                        <textarea
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            className='panel__textarea'
                            placeholder={`Paste the full job description here...\ne.g. 'Senior Frontend Engineer at Google requires proficiency in React, TypeScript, and large-scale system design...'`}
                            maxLength={5000}
                        />
                        <div className='char-counter'>{jobDescription.length} / 5000 chars</div>
                    </div>

                    {/* Vertical Divider */}
                    <div className='panel-divider' />

                    {/* Right Panel - Profile */}
                    <div className='panel panel--right'>
                        <div className='panel__header'>
                            <span className='panel__icon'>
                                <User size={18} />
                            </span>
                            <h2>Your Profile</h2>
                        </div>

                        {/* Upload Resume */}
                        
                        <div className="upload-section">
                            <label className="section-label">
                                Upload Resume
                                <span className="badge badge--best">Best Results</span>
                            </label>

                            <label className="dropzone" htmlFor="resume">
                                <span className="dropzone__icon">
                                    <UploadCloud size={28} />
                                </span>

                                <p className="dropzone__title">
                                    {resumeFileName || "Click to upload or drag & drop"}
                                </p>

                                <p className="dropzone__subtitle">
                                    PDF only (Max 5 MB)
                                </p>

                                <input
                                    ref={resumeInputRef}
                                    hidden
                                    type="file"
                                    id="resume"
                                    name="resume"
                                    accept=".pdf,application/pdf"
                                    onChange={handleResumeChange}
                                />
                            </label>

                            {error && (
                                <p className="form-error" role="alert">
                                    {error}
                                </p>
                            )}
                        </div>


                        {/* OR Divider */}
                        <div className='or-divider'><span>OR</span></div>

                        {/* Quick Self-Description */}
                        <div className='self-description'>
                            <label className='section-label' htmlFor='selfDescription'>Quick Self-Description</label>
                            <textarea
                                value={selfDescription}
                                onChange={(e) => setSelfDescription(e.target.value)}
                                id='selfDescription'
                                name='selfDescription'
                                className='panel__textarea panel__textarea--short'
                                placeholder="Briefly describe your experience, key skills, and years of experience if you don't have a resume handy..."
                            />
                        </div>

                        {/* Info Box */}
                        <div className='info-box'>
                            <span className='info-box__icon'>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" stroke="#1a1f27" strokeWidth="2" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" stroke="#1a1f27" strokeWidth="2" />
                                </svg>
                            </span>
                            <p>Either a <strong>Resume</strong> or a <strong>Self Description</strong> is required to generate a personalized plan.</p>
                        </div>
                    </div>
                </div>
                {error && (
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                )}
                {/* Card Footer */}
                <div className='interview-card__footer'>
                    <span className='footer-info'>AI-Powered Strategy Generation &bull; Approx 30s</span>
                    <button onClick={handleGenerateReport} className='generate-btn'>
                        <Star size={16} fill='currentColor' />
                        Generate My Interview Strategy
                    </button>
                </div>
            </div>

            {/* Recent Reports List */}
            {reports.length > 0 && (
                <section className='recent-reports'>
                    <h2>My Recent Interview Plans</h2>
                    <ul className='reports-list'>
                        {reports.map(report => (
                            <li key={report._id} className='report-item' onClick={() => navigate(`/interview/${report._id}`)}>
                                <h3>{report.title || 'Untitled Position'}</h3>
                                <p className='report-meta'>Generated on {new Date(report.createdAt).toLocaleDateString()}</p>
                                <p className={`match-score ${report.matchScore >= 80 ? 'score--high' : report.matchScore >= 60 ? 'score--mid' : 'score--low'}`}>Match Score: {report.matchScore}%</p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Page Footer */}
            <footer className='page-footer'>
                <a href='#'>Privacy Policy</a>
                <a href='#'>Terms of Service</a>
                <a href='#'>Help Center</a>
            </footer>
        </div>
    )
}

export default Home