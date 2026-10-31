import { useContext, useEffect } from "react";
import { AuthContext } from "../auth.context.js";
import { login, register, logout, getMe } from "../services/auth.api";



export const useAuth = () => {

    const context = useContext(AuthContext)
    const { user, setUser, loading, setLoading } = context


    const handleLogin = async ({ email, password }) => {
        setLoading(true)
        try {
            const data = await login({ email, password })
            setUser(data.user)
            return true
        } catch (err) {
            console.error('Login failed:', err)
            return false
        } finally {
            setLoading(false)
        }
    }

    const handleRegister = async ({ username, email, password }) => {
        setLoading(true)
        try {
            const data = await register({ username, email, password })
            setUser(data.user)
            return true
        } catch (err) {
            console.error('Register failed:', err)
            return false
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = async () => {
        setLoading(true)
        try {
            await logout()
            setUser(null)
        } catch (err) {
            console.error('Logout failed:', err)
        } finally {
            setLoading(false)
        }
    }

    // to handle we dont need to login again and again when we refresh the page or open the app again and again we will use getMe api to get the user data from the server and set it in the context so that we can use it in the app

    useEffect(() => {

        const getAndSetUser = async () => {
            try {

                const data = await getMe()
                setUser(data.user)
            } catch {
                setUser(null)
            } finally {
                setLoading(false)
            }
        }

        getAndSetUser()

    }, [setLoading, setUser])

    return { user, loading, handleRegister, handleLogin, handleLogout }
}
