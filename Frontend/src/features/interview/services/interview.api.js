const BASE_URL = 'http://localhost:3000/api/interview'

/**
 * Generate an interview report by sending resume PDF + job/self description
 * @param {{ resumeFile: File, jobDescription: string, selfDescription: string }} data
 */
export async function generateReportApi({ resumeFile, jobDescription, selfDescription }) {
    const formData = new FormData()
    if (resumeFile) formData.append('resume', resumeFile)
    formData.append('jobDescription', jobDescription)
    formData.append('selfDescription', selfDescription)

    const res = await fetch(`${BASE_URL}/`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Failed to generate report')
    return data.interviewReport
}

/**
 * Get a single interview report by its ID
 * @param {string} interviewId
 */
export async function getReportByIdApi(interviewId) {
    const res = await fetch(`${BASE_URL}/${interviewId}`, {
        method: 'GET',
        credentials: 'include',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Failed to fetch report')
    return data.interviewReport
}

/**
 * Get all interview reports for the logged-in user
 */
export async function getAllReportsApi() {
    const res = await fetch(`${BASE_URL}/all`, {
        method: 'GET',
        credentials: 'include',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Failed to fetch reports')
    return data.interviewReports
}

/**
 * Generate a resume PDF for a given interview report
 * @param {string} interviewReportId
 */
export async function getResumePdfApi(interviewReportId) {
    const res = await fetch(`${BASE_URL}/resume/pdf/${interviewReportId}`, {
        method: 'POST',
        credentials: 'include',
    })
    if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to generate resume PDF')
    }
    // Returns a blob (PDF file)
    return await res.blob()
}
