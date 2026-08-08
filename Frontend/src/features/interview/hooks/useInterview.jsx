import { useContext } from 'react'
import { InterviewContext } from '../interview.context'
import { generateReportApi, getReportByIdApi, getAllReportsApi, getResumePdfApi } from '../services/interview.api'

export function useInterview() {
    const { loading, setLoading, report, setReport, reports, setReports } = useContext(InterviewContext)

    /**
     * Generate a new interview report
     */
    async function generateReport({ jobDescription, selfDescription, resumeFile }) {
        setLoading(true)
        try {
            const newReport = await generateReportApi({ resumeFile, jobDescription, selfDescription })
            setReport(newReport)
            return newReport
        } catch (err) {
            console.error('API error in generateReport:', err)
            throw err   // re-throw so home.jsx catch block receives it
        } finally {
            setLoading(false)
        }
    }

    /**
     * Fetch a single interview report by ID
     */
    async function getReportById(interviewId) {
        setLoading(true)
        try {
            const fetchedReport = await getReportByIdApi(interviewId)
            setReport(fetchedReport)
        } finally {
            setLoading(false)
        }
    }

    /**
     * Fetch all interview reports for the logged-in user
     */
    async function getAllReports() {
        setLoading(true)
        try {
            const allReports = await getAllReportsApi()
            setReports(allReports)
        } finally {
            setLoading(false)
        }
    }

    /**
     * Generate and download a resume PDF for a given report
     */
    async function getResumePdf(interviewReportId) {
        setLoading(true)
        try {
            const blob = await getResumePdfApi(interviewReportId)
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `resume-${interviewReportId}.pdf`
            link.click()
            URL.revokeObjectURL(url)
        } finally {
            setLoading(false)
        }
    }

    return { loading, report, reports, generateReport, getReportById, getAllReports, getResumePdf }
}