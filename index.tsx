import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import './index.css';

// --- CONFIGURATION & DATA ---

// This is a global variable from the EmailJS script in index.html
declare var emailjs: any;

const API_KEY = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });

const SALON_INFO = {
    name: "Selena Personal Beauty",
    address: "Viale Martiri della Libertà, 243 - Lissone (MB)",
    phone: "039 2458950",
    openingHours: {
        2: { open: "09:00", close: "19:00" }, // Tuesday
        3: { open: "14:00", close: "21:00" }, // Wednesday
        4: { open: "10:00", close: "19:00" }, // Thursday
        5: { open: "09:00", close: "19:00" }, // Friday
        6: { open: "09:00", close: "17:00" }, // Saturday
    },
    closedDays: [0, 1], // Sunday, Monday
};

const PASSWORDS = {
    employee: "Dipendenti20851",
    manager: "TSaloneJselena",
};

const servicesData = [
    { name: "Capelli", services: [
        { id: 'c1', name: "Piega", duration: 30, price: 25 },
        { id: 'c2', name: "Taglio & Piega", duration: 60, price: 50 },
        { id: 'c3', name: "Colore & Piega", duration: 90, price: 80 },
        { id: 'c4', name: "Shatush / Balayage", duration: 180, price: 150 },
        { id: 'c5', name: "Trattamento Ristrutturante", duration: 30, price: 30 },
        { id: 'c6', name: "Acconciatura Evento", duration: 60, price: 60 },
        { id: 'c7', name: "Colore Uomo", duration: 30, price: 30 },
        { id: 'c8', name: "Taglio Uomo", duration: 30, price: 25 },
        { id: 'c9', name: "Permanente", duration: 120, price: 90 },
    ]},
    { name: "Mani e Piedi", services: [
        { id: 'm1', name: "Manicure Classica", duration: 30, price: 20 },
        { id: 'm2', name: "Manicure Semipermanente", duration: 60, price: 35 },
        { id: 'm3', name: "Ricostruzione Gel", duration: 90, price: 70 },
        { id: 'm4', name: "Pedicure Estetico", duration: 60, price: 40 },
        { id: 'm5', name: "Pedicure Curativo", duration: 60, price: 50 },
        { id: 'm6', name: "Trattamento Spa Mani/Piedi", duration: 30, price: 25 },
    ]},
    { name: "Viso & Corpo", services: [
        { id: 'v1', name: "Pulizia Viso Profonda", duration: 60, price: 60 },
        { id: 'v2', name: "Trattamento Anti-Age", duration: 60, price: 75 },
        { id: 'v3', name: "Laminazione Ciglia", duration: 60, price: 65 },
        { id: 'v4', name: "Epilazione Gambe", duration: 30, price: 30 },
        { id: 'v5', name: "Epilazione Inguine", duration: 30, price: 25 },
        { id: 'v6', name: "Massaggio Rilassante (50 min)", duration: 60, price: 60 },
        { id: 'v7', name: "Massaggio Decontratturante (50 min)", duration: 60, price: 70 },
        { id: 'v8', name: "Scrub Corpo", duration: 30, price: 40 },
        { id: 'v9', name: "Make-Up Giorno/Sera", duration: 60, price: 50 },
    ]},
    { name: "Consulenza & Olistico", services: [
        { id: 'o1', name: "Consulenza d'Immagine", duration: 60, price: 80 },
        { id: 'o2', name: "Riflessologia Plantare", duration: 60, price: 60 },
    ]},
    { name: "Medico & Dentale", services: [
        { id: 'd1', name: "Sbiancamento Dentale LED", duration: 60, price: 120 },
    ]},
];

// --- TYPES ---
type Role = 'client' | 'employee' | 'manager';
type BookingStatus = 'confermato' | 'completato' | 'annullato';

interface Service {
    id: string;
    name: string;
    duration: number;
    price: number;
}
interface Booking {
    id: string;
    serviceId: string;
    clientName: string;
    clientSurname: string;
    clientPhone: string;
    dateTime: string;
    status: BookingStatus;
}
interface Message {
    sender: 'user' | 'ai';
    text: string;
}

// --- CONTEXTS ---
const AuthContext = createContext<{ role: Role; login: (password: string) => Role | null; logout: () => void; } | null>(null);
const BookingContext = createContext<{ bookings: Booking[]; addBooking: (booking: Omit<Booking, 'id' | 'status'>) => void; updateBooking: (id: string, updates: Partial<Booking>) => void; findBooking: (phone: string, surname: string) => Booking[]; } | null>(null);

// --- PROVIDERS ---
const AuthProvider = ({ children }) => {
    const [role, setRole] = useState<Role>('client');

    const login = (password: string) => {
        if (password === PASSWORDS.employee) {
            setRole('employee');
            return 'employee';
        }
        if (password === PASSWORDS.manager) {
            setRole('manager');
            return 'manager';
        }
        return null;
    };
    const logout = () => setRole('client');

    return <AuthContext.Provider value={{ role, login, logout }}>{children}</AuthContext.Provider>;
};

const BookingProvider = ({ children }) => {
    const [bookings, setBookings] = useState<Booking[]>(() => {
        try {
            const savedBookings = localStorage.getItem('bookings');
            return savedBookings ? JSON.parse(savedBookings) : [];
        } catch (error) {
            console.error("Failed to parse bookings from localStorage", error);
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem('bookings', JSON.stringify(bookings));
    }, [bookings]);

    const addBooking = (bookingData: Omit<Booking, 'id' | 'status'>) => {
        const newBooking: Booking = {
            ...bookingData,
            id: Date.now().toString(),
            status: 'confermato',
        };
        setBookings(prev => [...prev, newBooking].sort((a,b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()));
        
        // --- REAL EMAIL NOTIFICATION USING EMAILJS ---
        // 1. Vai su https://www.emailjs.com, registrati e collega la tua email (tahajb232@gmail.com).
        // 2. Crea un Email Template. Usa le variabili tra {{ }} come vedi sotto (es. {{client_name}}).
        // 3. Incolla qui il tuo Service ID, Template ID e Public Key che trovi nel tuo account EmailJS.

        const serviceID = 'YOUR_SERVICE_ID';
        const templateID = 'YOUR_TEMPLATE_ID';
        const publicKey = 'YOUR_PUBLIC_KEY';

        const templateParams = {
            client_name: bookingData.clientName,
            client_surname: bookingData.clientSurname,
            client_phone: bookingData.clientPhone,
            service_name: servicesData.flatMap(c => c.services).find(s => s.id === bookingData.serviceId)?.name || 'N/D',
            date_time: new Date(bookingData.dateTime).toLocaleString('it-IT')
        };
        
        emailjs.send(serviceID, templateID, templateParams, publicKey)
          .then((response) => {
             console.log('SUCCESS! Email di notifica inviata.', response.status, response.text);
          }, (error) => {
             console.error('FAILED... Errore nell\'invio dell\'email:', error);
          });
        
        // --- SIMULATED SMS FOR CLIENT ---
        console.log(`--- MESSAGGIO PER IL CLIENTE (SMS SIMULATO) ---
"Ciao ${bookingData.clientName}, la tua prenotazione presso Selena Personal Beauty è confermata per ${new Date(bookingData.dateTime).toLocaleDateString('it-IT')} alle ${new Date(bookingData.dateTime).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}. Ti aspettiamo in Viale Martiri della Libertà 243, Lissone. Per modifiche o annullamenti accedi all'app o chiama 📞 039 2458950."`);
    };

    const updateBooking = (id: string, updates: Partial<Booking>) => {
        setBookings(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
        
        if(updates.status === 'annullato') {
            const booking = bookings.find(b => b.id === id);
             console.log(`--- NOTIFICA SIMULATA ---
Prenotazione ANNULLATA per ${booking?.clientName} ${booking?.clientSurname}.
Notifica inviata a responsabile (tahajb232@gmail.com).
Messaggio per cliente (${booking?.clientPhone}): "Ciao ${booking?.clientName}, la tua prenotazione presso Selena Personal Beauty è stata annullata come da tua richiesta."`);
        }
    };
    
    const findBooking = (phone: string, surname: string) => {
        return bookings.filter(b => b.clientPhone.trim() === phone.trim() && b.clientSurname.trim().toLowerCase() === surname.trim().toLowerCase());
    }

    return <BookingContext.Provider value={{ bookings, addBooking, updateBooking, findBooking }}>{children}</BookingContext.Provider>;
};

// --- HOOKS ---
const useAuth = () => useContext(AuthContext);
const useBookings = () => useContext(BookingContext);

// --- AI ASSISTANT COMPONENT ---
const AiAssistant = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    useEffect(scrollToBottom, [messages]);
    
    const systemInstruction = `Sei l'assistente virtuale di "Selena Personal Beauty", un centro estetico a Lissone.
    Il tuo tono deve essere sempre cortese, professionale e amichevole.
    Queste sono le informazioni sul salone che devi conoscere:
    - Nome: ${SALON_INFO.name}
    - Indirizzo: ${SALON_INFO.address}
    - Telefono: ${SALON_INFO.phone}
    - Orari: Martedì ${SALON_INFO.openingHours[2].open}-${SALON_INFO.openingHours[2].close}, Mercoledì ${SALON_INFO.openingHours[3].open}-${SALON_INFO.openingHours[3].close}, Giovedì ${SALON_INFO.openingHours[4].open}-${SALON_INFO.openingHours[4].close}, Venerdì ${SALON_INFO.openingHours[5].open}-${SALON_INFO.openingHours[5].close}, Sabato ${SALON_INFO.openingHours[6].open}-${SALON_INFO.openingHours[6].close}. Chiuso Domenica e Lunedì.
    - Servizi: Fornisci dettagli sui servizi se richiesto, basandoti sui nomi. Non inventare prezzi o durate.
    Il tuo compito è rispondere alle domande dei clienti, dare consigli di bellezza generici e fornire informazioni sul salone. Non puoi effettuare prenotazioni, ma puoi guidare l'utente su come usare l'app per prenotare.
    `;

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        const userMessage = { sender: 'user' as 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [...messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: m.text }]})), { role: 'user', parts: [{ text: input }] }],
                config: { systemInstruction },
            });

            const aiMessage = { sender: 'ai' as 'ai', text: response.text };
            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            console.error("Error calling Gemini API", error);
            const errorMessage = { sender: 'ai' as 'ai', text: "Oops! Qualcosa è andato storto. Riprova più tardi." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="ai-assistant">
            <div className="ai-header">🤖 Assistente Virtuale</div>
            <div className="ai-messages">
                <div className="message ai">Ciao! Sono il tuo assistente virtuale. Come posso aiutarti oggi?</div>
                {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.sender}`}>{msg.text}</div>
                ))}
                {isLoading && <div className="message ai typing"><span></span><span></span><span></span></div>}
                 <div ref={messagesEndRef} />
            </div>
            <div className="ai-input-area">
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleSend()}
                    placeholder="Scrivi un messaggio..."
                    disabled={isLoading}
                />
                <button onClick={handleSend} disabled={isLoading}>Invia</button>
            </div>
        </div>
    );
};


// --- CLIENT VIEW COMPONENTS ---
const ServiceCatalog = ({ onSelectService }) => (
    <div className="catalog-container">
        <h2>Catalogo Servizi</h2>
        {servicesData.map(category => (
            <div key={category.name} className="service-category">
                <h3>{category.name}</h3>
                <div className="services-grid">
                    {category.services.map(service => (
                        <div key={service.id} className="service-card-small" onClick={() => onSelectService(service)}>
                            <h4>{service.name}</h4>
                            <p>{service.duration} min - {service.price}€</p>
                        </div>
                    ))}
                </div>
            </div>
        ))}
    </div>
);

const BookingCalendar = ({ service, onBookingComplete }) => {
    const { bookings, addBooking } = useBookings();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedTime, setSelectedTime] = useState('');
    const [clientInfo, setClientInfo] = useState({ name: '', surname: '', phone: '' });
    const [step, setStep] = useState(1); // 1: calendar, 2: form, 3: confirmation

    const availableSlots = useMemo(() => {
        const dayOfWeek = selectedDate.getDay();
        if (SALON_INFO.closedDays.includes(dayOfWeek)) return [];

        const dayHours = SALON_INFO.openingHours[dayOfWeek];
        if (!dayHours) return [];

        const slots = [];
        const start = new Date(selectedDate);
        const [startH, startM] = dayHours.open.split(':').map(Number);
        start.setHours(startH, startM, 0, 0);

        const end = new Date(selectedDate);
        const [endH, endM] = dayHours.close.split(':').map(Number);
        end.setHours(endH, endM, 0, 0);

        const bookingsForDay = bookings.filter(b => new Date(b.dateTime).toDateString() === selectedDate.toDateString() && b.status !== 'annullato');

        while (start < end) {
            const slotTime = start.toTimeString().substring(0, 5);
            const slotEndTime = new Date(start.getTime() + service.duration * 60000);
            
            let isAvailable = true;
            if(slotEndTime > end) {
                isAvailable = false;
            } else {
                 for (const booking of bookingsForDay) {
                    const bookingStartTime = new Date(booking.dateTime);
                    const bookingService = servicesData.flatMap(c => c.services).find(s => s.id === booking.serviceId);
                    const bookingEndTime = new Date(bookingStartTime.getTime() + (bookingService?.duration || 0) * 60000);

                    if ((start >= bookingStartTime && start < bookingEndTime) || (slotEndTime > bookingStartTime && slotEndTime <= bookingEndTime)) {
                        isAvailable = false;
                        break;
                    }
                }
            }
           
            if (isAvailable) {
                slots.push(slotTime);
            }
            start.setMinutes(start.getMinutes() + 30);
        }
        return slots;
    }, [selectedDate, service, bookings]);

    const handleDateChange = (e) => {
        const dateValue = e.target.value;
        // Ensure dateValue is not an empty string, which would create an invalid date.
        if (dateValue) {
            // Splitting the date string and creating a new Date object from its components
            // avoids timezone-related issues where new Date('YYYY-MM-DD') might be interpreted
            // as the previous day in certain timezones west of UTC.
            const [year, month, day] = dateValue.split('-').map(Number);
            const newDate = new Date(year, month - 1, day);

            // Only update state if the resulting date is valid.
            if (!isNaN(newDate.getTime())) {
                setSelectedDate(newDate);
                setSelectedTime('');
            }
        }
    };
    
    const handleFormSubmit = (e) => {
        e.preventDefault();
        const [hours, minutes] = selectedTime.split(':').map(Number);
        const bookingDateTime = new Date(selectedDate);
        bookingDateTime.setHours(hours, minutes, 0, 0);

        addBooking({
            serviceId: service.id,
            clientName: clientInfo.name,
            clientSurname: clientInfo.surname,
            clientPhone: clientInfo.phone,
            dateTime: bookingDateTime.toISOString(),
        });
        setStep(3);
    }
    
    if (step === 3) {
        return <div className="confirmation-view">
            <h3>✅ Prenotazione Confermata!</h3>
            <p>Grazie, {clientInfo.name}. Il tuo appuntamento per <strong>{service.name}</strong> è stato fissato per il <strong>{new Date(selectedDate).toLocaleDateString('it-IT')}</strong> alle <strong>{selectedTime}</strong>.</p>
            <p>Il salone è stato notificato del tuo appuntamento. Riceverai a breve un riepilogo via SMS (simulato).</p>
            <button onClick={onBookingComplete}>Nuova Prenotazione</button>
        </div>
    }

    return (
        <div className="booking-container">
            <h2>Prenota: {service.name}</h2>
            {step === 1 && (
                <div className="calendar-step">
                    <h3>1. Seleziona Data e Ora</h3>
                    <input type="date" onChange={handleDateChange} value={selectedDate.toISOString().split('T')[0]} min={new Date().toISOString().split('T')[0]} />
                    <div className="time-slots">
                        {availableSlots.length > 0 ? availableSlots.map(time => (
                            <button key={time} className={`slot ${selectedTime === time ? 'selected' : ''}`} onClick={() => setSelectedTime(time)}>{time}</button>
                        )) : <p>Nessun orario disponibile per questa data.</p>}
                    </div>
                    <button onClick={() => setStep(2)} disabled={!selectedTime}>Avanti</button>
                </div>
            )}
            {step === 2 && (
                 <div className="form-step">
                    <h3>2. Inserisci i tuoi dati</h3>
                    <p>Appuntamento per il <strong>{new Date(selectedDate).toLocaleDateString('it-IT')}</strong> alle <strong>{selectedTime}</strong></p>
                    <form onSubmit={handleFormSubmit}>
                        <input type="text" placeholder="Nome" value={clientInfo.name} onChange={e => setClientInfo({...clientInfo, name: e.target.value})} required />
                        <input type="text" placeholder="Cognome" value={clientInfo.surname} onChange={e => setClientInfo({...clientInfo, surname: e.target.value})} required />
                        <input type="tel" placeholder="Telefono" value={clientInfo.phone} onChange={e => setClientInfo({...clientInfo, phone: e.target.value})} required />
                        <div className="form-buttons">
                            <button type="button" onClick={() => setStep(1)}>Indietro</button>
                            <button type="submit">Conferma Prenotazione</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    )
};

const ManageBooking = () => {
    const { findBooking, updateBooking } = useBookings();
    const [search, setSearch] = useState({ phone: '', surname: '' });
    const [foundBookings, setFoundBookings] = useState<Booking[] | null>(null);

    const handleSearch = (e) => {
        e.preventDefault();
        const results = findBooking(search.phone, search.surname);
        setFoundBookings(results);
    };
    
    const getServiceName = (id) => servicesData.flatMap(c => c.services).find(s => s.id === id)?.name || 'N/D';

    return (
        <div className="manage-booking-container">
            <h2>Cerca le tue prenotazioni</h2>
            <form onSubmit={handleSearch}>
                <input type="tel" placeholder="Il tuo telefono" value={search.phone} onChange={e => setSearch({...search, phone: e.target.value})} required/>
                <input type="text" placeholder="Il tuo cognome" value={search.surname} onChange={e => setSearch({...search, surname: e.target.value})} required/>
                <button type="submit">Cerca</button>
            </form>

            {foundBookings && (
                <div className="booking-results">
                    {foundBookings.length > 0 ? (
                        foundBookings.map(booking => (
                            <div key={booking.id} className={`booking-card status-${booking.status}`}>
                                <h4>{getServiceName(booking.serviceId)}</h4>
                                <p>Data: {new Date(booking.dateTime).toLocaleString('it-IT')}</p>
                                <p>Stato: <span className="status-badge">{booking.status}</span></p>
                                {booking.status === 'confermato' && (
                                    <button onClick={() => {
                                        if(confirm("Sei sicuro di voler annullare questa prenotazione?")) {
                                            updateBooking(booking.id, { status: 'annullato' });
                                            // Trigger re-render by re-searching
                                            setFoundBookings(findBooking(search.phone, search.surname));
                                        }
                                    }}>Annulla</button>
                                )}
                            </div>
                        ))
                    ) : <p>Nessuna prenotazione trovata con questi dati.</p>}
                </div>
            )}
        </div>
    );
};


const ClientView = () => {
    const [currentView, setCurrentView] = useState('catalog'); // catalog, booking, manage, ai
    const [selectedService, setSelectedService] = useState<Service | null>(null);

    const handleSelectService = (service: Service) => {
        setSelectedService(service);
        setCurrentView('booking');
    };

    const handleBookingComplete = () => {
        setSelectedService(null);
        setCurrentView('catalog');
    };

    const renderContent = () => {
        switch (currentView) {
            case 'booking':
                return <BookingCalendar service={selectedService} onBookingComplete={handleBookingComplete} />;
            case 'manage':
                return <ManageBooking />;
            case 'ai':
                return <AiAssistant />;
            case 'catalog':
            default:
                return <ServiceCatalog onSelectService={handleSelectService} />;
        }
    };
    
    return (
        <div className="client-view">
             <header className="app-header">
                <h1>{SALON_INFO.name}</h1>
                <nav>
                    <button className={currentView === 'catalog' ? 'active' : ''} onClick={() => setCurrentView('catalog')}>Servizi</button>
                    <button className={currentView === 'manage' ? 'active' : ''} onClick={() => setCurrentView('manage')}>Le mie prenotazioni</button>
                    <button className={currentView === 'ai' ? 'active' : ''} onClick={() => setCurrentView('ai')}>Assistente AI</button>
                </nav>
            </header>
            <main className="app-main">
                {renderContent()}
            </main>
        </div>
    );
};


// --- ADMIN VIEWS ---
const LoginView = () => {
    const { login } = useAuth();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        setError('');
        const role = login(password);
        if (!role) {
            setError('Password non corretta.');
        }
    };

    return (
        <div className="login-view">
            <form onSubmit={handleLogin}>
                <h2>Accesso Area Riservata</h2>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Inserisci password"
                />
                <button type="submit">Accedi</button>
                {error && <p className="error">{error}</p>}
            </form>
        </div>
    );
};

const AdminHeader = ({ title }) => {
    const { logout } = useAuth();
    return (
         <header className="app-header admin-header">
            <h1>{title}</h1>
            <button onClick={logout} className="logout-btn">Logout</button>
        </header>
    );
};

const EmployeeView = () => {
    const { bookings, updateBooking } = useBookings();
    const today = new Date().toDateString();
    
    const todayBookings = bookings.filter(b => new Date(b.dateTime).toDateString() === today && b.status === 'confermato');
    const futureBookings = bookings.filter(b => new Date(b.dateTime) > new Date() && new Date(b.dateTime).toDateString() !== today && b.status === 'confermato');
    
    const getServiceInfo = (id) => servicesData.flatMap(c => c.services).find(s => s.id === id);

    return (
        <div className="admin-view">
            <AdminHeader title="💇 Dipendente" />
            <main className="app-main">
                <div className="appointments-section">
                    <h3>Appuntamenti di Oggi</h3>
                    {todayBookings.length > 0 ? todayBookings.map(b => (
                        <div key={b.id} className="appointment-card">
                           <p><strong>Orario:</strong> {new Date(b.dateTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
                           <p><strong>Cliente:</strong> {b.clientName} {b.clientSurname} ({b.clientPhone})</p>
                           <p><strong>Servizio:</strong> {getServiceInfo(b.serviceId)?.name}</p>
                           <button onClick={() => updateBooking(b.id, {status: 'completato'})}>Completato</button>
                        </div>
                    )) : <p>Nessun appuntamento per oggi.</p>}
                </div>
                 <div className="appointments-section">
                    <h3>Appuntamenti Futuri</h3>
                     {futureBookings.length > 0 ? futureBookings.map(b => (
                        <div key={b.id} className="appointment-card">
                           <p><strong>Data:</strong> {new Date(b.dateTime).toLocaleString('it-IT')}</p>
                           <p><strong>Cliente:</strong> {b.clientName} {b.clientSurname} ({b.clientPhone})</p>
                           <p><strong>Servizio:</strong> {getServiceInfo(b.serviceId)?.name}</p>
                        </div>
                    )) : <p>Nessun appuntamento futuro.</p>}
                </div>
            </main>
        </div>
    );
};

const ManagerView = () => {
    const { bookings } = useBookings();
    const getServiceInfo = (id) => servicesData.flatMap(c => c.services).find(s => s.id === id);

    const stats = useMemo(() => {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const completedBookings = bookings.filter(b => b.status === 'completato');
        const monthlyBookings = completedBookings.filter(b => new Date(b.dateTime) >= firstDayOfMonth);

        const totalRevenue = completedBookings.reduce((acc, b) => acc + (getServiceInfo(b.serviceId)?.price || 0), 0);
        const monthlyRevenue = monthlyBookings.reduce((acc, b) => acc + (getServiceInfo(b.serviceId)?.price || 0), 0);
        
        // Fix: Add type to the reduce accumulator to allow TypeScript to correctly infer the type of serviceCounts.
        const serviceCounts = completedBookings.reduce((acc: Record<string, { count: number, revenue: number }>, b) => {
            const service = getServiceInfo(b.serviceId);
            if (service) {
                acc[service.name] = (acc[service.name] || { count: 0, revenue: 0 });
                acc[service.name].count++;
                acc[service.name].revenue += service.price;
            }
            return acc;
        }, {});

        const topServices = Object.entries(serviceCounts).sort(([,a], [,b]) => b.count - a.count).slice(0, 5);
        
        return { totalBookings: completedBookings.length, monthlyBookings: monthlyBookings.length, totalRevenue, monthlyRevenue, topServices, serviceCounts };

    }, [bookings]);

    const nextAppointments = bookings.filter(b => new Date(b.dateTime) > new Date() && b.status === 'confermato').slice(0, 5);


    return (
        <div className="admin-view manager-view">
             <AdminHeader title="👩‍💼 Responsabile" />
             <main className="app-main">
                <h3>Dashboard</h3>
                <div className="stats-grid">
                    <div className="stat-card"><h4>Prenotazioni Totali</h4><p>{stats.totalBookings}</p></div>
                    <div className="stat-card"><h4>Fatturato Totale</h4><p>{stats.totalRevenue.toFixed(2)}€</p></div>
                    <div className="stat-card"><h4>Prenotazioni Mese</h4><p>{stats.monthlyBookings}</p></div>
                    <div className="stat-card"><h4>Fatturato Mese</h4><p>{stats.monthlyRevenue.toFixed(2)}€</p></div>
                </div>

                <div className="manager-columns">
                    <div className="column">
                        <h3>Top 5 Servizi</h3>
                        <ul className="top-services-list">
                            {stats.topServices.map(([name, data]) => (
                                <li key={name}><strong>{name}</strong>: {data.count} volte</li>
                            ))}
                        </ul>
                    </div>
                     <div className="column">
                        <h3>Prossimi Appuntamenti</h3>
                        {nextAppointments.length > 0 ? nextAppointments.map(b => (
                             <div key={b.id} className="appointment-card-small">
                                <p>{new Date(b.dateTime).toLocaleString('it-IT')} - {b.clientName} {b.clientSurname}</p>
                                <p><i>{getServiceInfo(b.serviceId)?.name}</i></p>
                             </div>
                        )) : <p>Nessun appuntamento imminente.</p>}
                    </div>
                </div>
                 <div className="column full-width">
                        <h3>Analisi per Servizio</h3>
                        <table className="services-table">
                            <thead><tr><th>Servizio</th><th>Conteggio</th><th>Fatturato</th></tr></thead>
                            <tbody>
                                {Object.entries(stats.serviceCounts).sort(([,a],[,b]) => b.revenue - a.revenue).map(([name, data]) => (
                                     <tr key={name}><td>{name}</td><td>{data.count}</td><td>{data.revenue.toFixed(2)}€</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
             </main>
        </div>
    );
};

// --- MAIN APP ---
const App = () => {
  const { role } = useAuth();

  if (role === 'client') return <ClientView />;
  if (role === 'employee') return <EmployeeView />;
  if (role === 'manager') return <ManagerView />;
  
  return <LoginView />;
};

const AppWrapper = () => {
    const [view, setView] = useState('client'); // client, login
    
    // This allows a "portal" to the login screen without full auth state management at the top level
    if (view === 'login') {
        return (
            <AuthProvider>
                <BookingProvider>
                    <div className="app-container">
                        <LoginView />
                        <button className="back-to-client-view" onClick={() => setView('client')}>Torna alla vista cliente</button>
                    </div>
                </BookingProvider>
            </AuthProvider>
        );
    }
    
    return (
        <AuthProvider>
            <BookingProvider>
                <div className="app-container">
                    <App />
                    <button className="admin-login-button" onClick={() => setView('login')}>🔑</button>
                </div>
            </BookingProvider>
        </AuthProvider>
    );
}


const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<AppWrapper />);