import { useCallback, useContext } from 'react'
import { InterviewContext } from '../interview.context.js'
import { generateReportApi, getReportByIdApi, getAllReportsApi } from '../services/interview.api'

export function useInterview() {
    const { loading, setLoading, report, setReport, reports, setReports } = useContext(InterviewContext)

    /**
     * Generate a new interview report
     */
    const generateReport = useCallback(async ({ jobDescription, selfDescription, resumeFile }) => {
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
    }, [setLoading, setReport])

    /**
     * Fetch a single interview report by ID
     */
    const getReportById = useCallback(async (interviewId) => {
        setLoading(true)
        try {
            const fetchedReport = await getReportByIdApi(interviewId)
            setReport(fetchedReport)
        } finally {
            setLoading(false)
        }
    }, [setLoading, setReport])

    /**
     * Fetch all interview reports for the logged-in user
     */
    const getAllReports = useCallback(async () => {
        setLoading(true)
        try {
            const allReports = await getAllReportsApi()
            setReports(allReports)
        } finally {
            setLoading(false)
        }
    }, [setLoading, setReports])

    return { loading, report, reports, generateReport, getReportById, getAllReports }
}
